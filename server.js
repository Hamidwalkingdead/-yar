const express = require('express');
const { Pool } = require('pg');
const app = express();

app.use(express.json());

// ۱. اتصال به دیتابیس PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ride_hailing_db',
    password: 'your_password', // رمز عبور دیتابیس خود را وارد کنید
    port: 5432,
});

// ۲. تابع محاسبه هوشمند و پویا قیمت (Dynamic Fare Calculation)
async function calculateTripFare(distanceKm, options = {}) {
    const { isNight, isRainy, isSnowy, isMountainous } = options;
    const configResult = await pool.query('SELECT * FROM pricing_configs ORDER BY config_id DESC LIMIT 1');
    
    // اگر جدول تنظیمات خالی بود، مقادیر پیش‌فرض در نظر گرفته شود
    const config = configResult.rows[0] || {
        base_per_km: 11000,
        night_extra: 1000,
        bad_weather_extra: 1000,
        snowy_weather_extra: 2000,
        mountainous_route_extra: 1000,
        commission_percentage: 9.00
    };

    let ratePerKm = parseFloat(config.base_per_km);

    if (isNight) ratePerKm += parseFloat(config.night_extra);
    if (isRainy) ratePerKm += parseFloat(config.bad_weather_extra);
    if (isSnowy) ratePerKm += parseFloat(config.snowy_weather_extra);
    if (isMountainous) ratePerKm += parseFloat(config.mountainous_route_extra);

    let totalFare = Math.round(distanceKm * ratePerKm);
    const commissionAmount = Math.round((totalFare * parseFloat(config.commission_percentage)) / 100);
    const driverShare = totalFare - commissionAmount;

    return { distanceKm, ratePerKmUsed: ratePerKm, totalFare, commissionAmount, driverShare };
}


// ==================== مسیرهای بخش مسافر (Passenger Routes) ====================

// تخمین کرایه پیش از درخواست سفر
app.post('/api/trips/estimate-fare', async (req, res) => {
    const { distanceKm, isNight, isRainy, isSnowy, isMountainous } = req.body;
    try {
        const fareDetails = await calculateTripFare(distanceKm, { isNight, isRainy, isSnowy, isMountainous });
        res.json(fareDetails);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ثبت درخواست سفر جدید
app.post('/api/trips/request', async (req, res) => {
    const { passengerId, pickupLat, pickupLng, destLat, destLng, fareDetails } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO trips (passenger_id, pickup_location, destination_location, fare, status) 
             VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, 'requested') 
             RETURNING *`,
            [passengerId, pickupLng, pickupLat, destLng, destLat, fareDetails.totalFare]
        );
        res.status(201).json({ message: "سفر ثبت شد و به دنبال راننده هستیم", trip: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// مشاهده موجودی کیف پول و تراکنش‌ها
app.get('/api/wallet/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await pool.query('SELECT wallet_balance FROM users WHERE user_id = $1', [userId]);
        const transactions = await pool.query('SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        res.json({ balance: user.rows[0]?.wallet_balance || 0, transactions: transactions.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==================== مسیرهای بخش راننده (Driver Routes) ====================

// آپدیت موقعیت مکانی زنده راننده (پس‌زمینه)
app.post('/api/driver/update-location', async (req, res) => {
    const { driverId, latitude, longitude } = req.body;
    try {
        await pool.query(
            `UPDATE drivers 
             SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326) 
             WHERE driver_id = $3`,
            [longitude, latitude, driverId]
        );
        res.json({ message: "موقعیت بروزرسانی شد" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// شروع سفر (با اعمال قانون اجازه ۲ سفر با موجودی صفر)
app.post('/api/trips/start', async (req, res) => {
    const { driverId, tripId } = req.body;
    try {
        const driverResult = await pool.query('SELECT wallet_balance, temporary_trip_count FROM users WHERE user_id = $1', [driverId]);
        if (driverResult.rows.length === 0) return res.status(404).json({ error: "راننده یافت نشد" });

        const { wallet_balance, temporary_trip_count } = driverResult.rows[0];
        let canStartTrip = false;

        if (wallet_balance > 0) {
            canStartTrip = true;
        } else if (temporary_trip_count < 2) {
            canStartTrip = true;
            await pool.query('UPDATE users SET temporary_trip_count = temporary_trip_count + 1 WHERE user_id = $1', [driverId]);
        } else {
            return res.status(403).json({ error: "موجودی کافی نیست و سهمیه سفر موقت تمام شده است." });
        }

        if (canStartTrip) {
            await pool.query('UPDATE trips SET status = $1 WHERE trip_id = $2', ['started', tripId]);
            res.json({ message: "سفر آغاز شد" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ثبت تیکت پشتیبانی توسط راننده/مسافر
app.post('/api/tickets', async (req, res) => {
    const { userId, subject, message } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO support_tickets (user_id, subject, message) VALUES ($1, $2, $3) RETURNING *',
            [userId, subject, message]
        );
        res.status(201).json({ message: "تیکت ثبت شد", ticket: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==================== مسیرهای بخش ادمین (Admin Routes) ====================

// میدل‌ور بررسی نقش ادمین
const checkAdmin = async (req, res, next) => {
    const { adminId } = req.headers;
    const user = await pool.query('SELECT role FROM users WHERE user_id = $1', [adminId]);
    if (user.rows.length > 0 && user.rows[0].role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: "دسترسی غیرمجاز (فقط ادمین)" });
    }
};

// مشاهده و تغییر تنظیمات قیمت‌پویا
app.get('/api/admin/pricing-config', checkAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM pricing_configs ORDER BY config_id DESC LIMIT 1');
    res.json(result.rows[0]);
});

app.put('/api/admin/pricing-config', checkAdmin, async (req, res) => {
    const { base_per_km, night_extra, bad_weather_extra, snowy_weather_extra, mountainous_route_extra, commission_percentage } = req.body;
    await pool.query(
        `UPDATE pricing_configs 
         SET base_per_km = $1, night_extra = $2, bad_weather_extra = $3, snowy_weather_extra = $4, mountainous_route_extra = $5, commission_percentage = $6`,
        [base_per_km, night_extra, bad_weather_extra, snowy_weather_extra, mountainous_route_extra, commission_percentage]
    );
    res.json({ message: "تنظیمات قیمت بروزرسانی شد" });
});

// مشاهده تمام تیکت‌ها و پاسخ به آن‌ها
app.get('/api/admin/tickets', checkAdmin, async (req, res) => {
    const result = await pool.query('SELECT t.*, u.name, u.phone FROM support_tickets t JOIN users u ON t.user_id = u.user_id ORDER BY t.created_at DESC');
    res.json(result.rows);
});

app.patch('/api/admin/tickets/:ticketId', checkAdmin, async (req, res) => {
    const { ticketId } = req.params;
    const { adminResponse, status } = req.body;
    const result = await pool.query(
        'UPDATE support_tickets SET admin_response = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = $3 RETURNING *',
        [adminResponse, status, ticketId]
    );
    res.json({ message: "پاسخ ثبت شد", ticket: result.rows[0] });
});

// گزارش درآمد کل سیستم
app.get('/api/admin/reports/revenue', checkAdmin, async (req, res) => {
    const result = await pool.query("SELECT SUM(amount) as total_revenue FROM wallet_transactions WHERE type = 'deposit'");
    res.json(result.rows[0]);
});


// ۳. روشن کردن سرور
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running and ready on port ${PORT}`);
});
