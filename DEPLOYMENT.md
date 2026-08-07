# راهنمای کامل: انتقال پروژه از Vercel + Render به یک VPS واحد

این راهنما گام‌به‌گام توضیح می‌دهد چطور یک سرور مجازی (VPS) بخرید، آماده‌اش کنید،
و پروژهٔ school را طوری رویش مستقر (deploy) کنید که هم فرانت‌اند و هم بک‌اند از
یک آدرس/دامنه سرو شوند — بدون نیاز به Vercel یا Render.

فایل‌های کمکی مرتبط در پوشهٔ `deploy/`:
- `deploy/ecosystem.config.js` — فایل PM2 برای اجرا و نگه‌داری دائمی بک‌اند
- `deploy/nginx.school.conf.example` — کانفیگ آمادهٔ Nginx
- `deploy/deploy.sh` — اسکریپت یک‌خطی برای هر بار آپدیت کد روی سرور

---

## مرحلهٔ ۱: خرید VPS

یکی از این‌ها را انتخاب کنید (بر اساس دسترسی به روش پرداخت):

- **Hetzner** (hetzner.com) → پلن CX22، حدود €4/ماه، دیتاسنتر آلمان/فنلاند
- **DigitalOcean** (digitalocean.com) → Basic Droplet، حدود $6/ماه
- **Contabo** (contabo.com) → VPS S، حدود €5/ماه

هنگام ساخت سرور:
- سیستم‌عامل: **Ubuntu 22.04 LTS**
- حداقل مشخصات: ۱ vCPU / ۱-۲ گیگ رم / ۲۰+ گیگ دیسک (کافی برای شروع)
- یک SSH key بسازید و انتخاب کنید (اگر بلد نیستید، همان صفحهٔ سایت معمولاً
  دکمهٔ "Generate" یا راهنما دارد؛ یا از لوکال با `ssh-keygen -t ed25519` بسازید)

بعد از ساخت سرور یک **آدرس IP** به شما می‌دهند (مثلاً `203.0.113.10`) — این را
یادداشت کنید.

---

## مرحلهٔ ۲: اولین اتصال به سرور

از کامپیوتر خودتان (ترمینال / PowerShell):

```bash
ssh root@203.0.113.10
```

(آی‌پی واقعی سرورتان را جایگزین کنید)

### ساخت یک کاربر غیر-root (برای امنیت)

```bash
adduser deploy
usermod -aG sudo deploy
```

از این به بعد با این کاربر وصل شوید:

```bash
ssh deploy@203.0.113.10
```

### فایروال پایه

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

فقط پورت‌های SSH، HTTP و HTTPS باز می‌مانند.

---

## مرحلهٔ ۳: نصب پیش‌نیازها روی سرور

```bash
# آپدیت سیستم
sudo apt update && sudo apt upgrade -y

# Node.js LTS (نسخهٔ ۲۰)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# PM2 (نگه‌دارندهٔ پروسهٔ Node — خودکار ری‌استارت می‌کند)
sudo npm install -g pm2

# Certbot (برای SSL رایگان)
sudo apt install -y certbot python3-certbot-nginx
```

بررسی نصب:

```bash
node -v     # باید چیزی مثل v20.x.x نشان دهد
npm -v
nginx -v
pm2 -v
```

---

## مرحلهٔ ۴: گرفتن کد پروژه روی سرور

به‌جای آپلود از لوکال، ساده‌تر این است که مستقیماً از GitHub روی سرور clone کنید:

```bash
cd ~
git clone https://github.com/hafezghafori-afk/school.git
cd school
```

(اگر ریپازیتوری private است، باید یک [Personal Access
Token](https://github.com/settings/tokens) بسازید و در آدرس clone استفاده
کنید، یا یک SSH key روی سرور بسازید و به GitHub اضافه کنید — بگویید کدام را
ترجیح می‌دهید تا دقیق راهنمایی کنم.)

---

## مرحلهٔ ۵: تنظیم متغیرهای محیطی بک‌اند

```bash
cd ~/school/backend
cp .env.example .env
nano .env
```

همان مقادیری که الان در تنظیمات Render دارید را اینجا هم کپی کنید:
`MONGO_URI` (همان Atlas فعلی)، `JWT_SECRET`، تنظیمات ایمیل (`SMTP_*`)، تنظیمات
R2 اگر استفاده می‌کنید، و بقیهٔ مقادیر مربوط به مالی/۲FA. برای `PORT` می‌توانید
`5000` بگذارید.

`CORS_ORIGIN` را می‌توانید به دامنهٔ نهایی‌تان تغییر دهید (چون حالا فرانت و
بک‌اند هم‌مبدأ هستند، عملاً کمتر به آن نیاز دارید، ولی خالی نگذاریدش).

ذخیره و خروج: `Ctrl+O` سپس `Enter`، بعد `Ctrl+X`.

---

## مرحلهٔ ۶: نصب و build

```bash
cd ~/school/backend
npm ci --omit=dev

cd ~/school/frontend
npm ci
npm run build
```

بعد از این دستور، پوشهٔ `frontend/dist` ساخته می‌شود — همان چیزی که بک‌اند
خودش به‌صورت خودکار سرو می‌کند (چون `backend/server.js` دقیقاً دنبال
`../frontend/dist` می‌گردد).

---

## مرحلهٔ ۷: اجرای بک‌اند با PM2

```bash
cd ~/school
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup
```

دستور آخر (`pm2 startup`) یک خط دستور دیگر به شما نشان می‌دهد که باید آن را
هم کپی/اجرا کنید — این کار باعث می‌شود بعد از هر ری‌استارت سرور، اپلیکیشن
خودش دوباره بالا بیاید.

تست سریع (روی خود سرور):

```bash
curl http://localhost:5000/api/health
```

باید `"status":"OK"` ببینید.

---

## مرحلهٔ ۸: دامنه + Nginx + SSL

1. در تنظیمات DNS دامنه‌تان، یک رکورد **A** بسازید که به IP سرور اشاره کند
   (مثلاً `school.example.com → 203.0.113.10`).
2. کانفیگ آمادهٔ Nginx را فعال کنید:

```bash
sudo cp ~/school/deploy/nginx.school.conf.example /etc/nginx/sites-available/school
sudo nano /etc/nginx/sites-available/school
# خط server_name را با دامنهٔ واقعی خودتان جایگزین کنید

sudo ln -s /etc/nginx/sites-available/school /etc/nginx/sites-enabled/school
sudo nginx -t
sudo systemctl reload nginx
```

3. گرفتن گواهی SSL رایگان:

```bash
sudo certbot --nginx -d school.example.com
```

Certbot خودش کانفیگ Nginx را برای HTTPS و ریدایرکت خودکار HTTP→HTTPS تنظیم
می‌کند.

حالا با باز کردن `https://school.example.com` باید سایت را ببینید — همان
فرانت‌اند، سرو شده از همان سروری که API رویش اجرا می‌شود.

---

## مرحلهٔ ۹: هر بار که کد جدید دارید (آپدیت‌های بعدی)

روی سرور:

```bash
cd ~/school
./deploy/deploy.sh
```

این یک اسکریپت آماده در پروژه است که کد را از `main` می‌گیرد، وابستگی‌ها را
نصب می‌کند، فرانت را دوباره build می‌کند، و بک‌اند را با PM2 ری‌استارت
می‌کند.

---

## مرحلهٔ ۱۰: مانیتورینگ ساده (اختیاری ولی توصیه‌شده)

- `pm2 status` و `pm2 logs school` برای دیدن وضعیت و لاگ‌های زنده
- یک حساب رایگان در [UptimeRobot](https://uptimerobot.com) بسازید و آدرس
  `https://school.example.com/api/health` را برای پینگ هر ۵ دقیقه اضافه
  کنید — اگر سرور پایین بیاید، به ایمیل/تلگرام‌تان خبر می‌دهد.

---

## نکات امنیتی حداقلی

- ورود root با رمز را غیرفعال کنید (فقط SSH key): در
  `/etc/ssh/sshd_config` مقدار `PermitRootLogin no` و
  `PasswordAuthentication no` را تنظیم کنید، بعد `sudo systemctl restart ssh`.
- `sudo apt update && sudo apt upgrade -y` را هر چند وقت یک‌بار دستی اجرا
  کنید (یا `unattended-upgrades` را فعال کنید).
- فایل `.env` را هرگز commit نکنید (از قبل در `.gitignore` است).

---

اگر هر مرحله گیر کردید (خطای دقیق را کپی کنید و بفرستید)، همین‌جا ادامه
می‌دهیم و قدم‌به‌قدم رفع‌اش می‌کنیم.
