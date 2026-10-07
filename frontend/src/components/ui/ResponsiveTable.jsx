import React, { useLayoutEffect, useRef } from 'react';
import './responsive-table.css';

// جدول‌هایی که روی گوشی کارت می‌شوند — بدون بازنویسی هیچ صفحه‌ای.
//
// مشکل: یک جدول شش‌ستونه روی صفحهٔ ۳۶۰px یا افقی اسکرول می‌شود یا آن‌قدر فشرده
// که خوانده نمی‌شود. راه‌حل معمول (کارت کردن ردیف‌ها) یعنی هر سلول باید عنوان
// ستونش را کنار خودش داشته باشد، وگرنه کاربر یک ستون عدد می‌بیند بدون اینکه
// بداند کدام کدام است.
//
// چرا این‌طوری و نه جور دیگر:
//   - صفحات هدف غول‌اند (AdminFinance ۱۵ هزار خط). هیچ JSX جدولی بازنویسی
//     نمی‌شود؛ فقط `div` دورِ جدول با این کامپوننت عوض می‌شود. یک گره DOM اضافه
//     نمی‌شود — همین کامپوننت همان div است و همان className را می‌گیرد.
//   - عنوان‌ها از خودِ `<thead>` خوانده می‌شوند، نه از یک prop. پس وقتی کسی
//     ستونی را عوض کرد، عنوانِ کارت هم با آن عوض می‌شود و دو جا از هم نمی‌افتند.
//   - عنوان‌ها به‌صورت متغیرِ CSS (`--rt-1` تا `--rt-12`) روی همین عنصر نوشته
//     می‌شوند و CSS با `nth-child` هر سلول را برمی‌دارد. یعنی هیچ ردیفی دست
//     نمی‌خورد: یک جدول پانصد ردیفی همان‌قدر هزینه دارد که یک جدول پنج ردیفی،
//     و ردیف‌هایی که بعداً رندر می‌شوند خودبه‌خود برچسب می‌گیرند.
//   - تبدیل کاملاً در CSS و زیر ۶۴۰px اتفاق می‌افتد. بالای آن هیچ چیز عوض
//     نمی‌شود، نه ساختار نه استایل.
//
// دو شکلِ جدول پشتیبانی می‌شود، چون پروژه هر دو را دارد:
//   ۱. `<table>` واقعی با `<thead>` — StudentManagement، AttendanceManager، ...
//   ۲. جدولِ گریدی `.finance-table` با یک `.head` و چند `.row` — AdminFinance
//      که اصلاً `<table>` ندارد.

// بیشتر از این تعداد ستون روی گوشی به هر حال خوانا نیست؛ اگر جدولی بیشتر داشت
// ستون‌های اضافه بدون برچسب می‌مانند نه اینکه برچسبِ غلط بگیرند.
const MAX_LABELLED_COLUMNS = 12;

const readHeaderLabels = (root) => {
  const thead = root.tagName === 'TABLE' ? root.querySelector(':scope > thead') : null;
  if (thead) {
    const headRows = thead.querySelectorAll(':scope > tr');
    // سرستونِ دوطبقه (rowSpan/colSpan، مثل شقهٔ نمرات) را نمی‌شود بی‌خطر به
    // سلول‌های تخت نگاشت. برچسبِ غلط از نبودِ برچسب بدتر است، پس رد می‌شود.
    if (headRows.length !== 1) return [];
    return Array.from(headRows[0].children).map((cell) => cell.textContent.trim());
  }

  // `data-rt-head` برای سرستون‌هایی که به هر دلیلی کلاسِ `head` ندارند — مثلِ
  // فهرستِ بل‌ها در AdminFinance که سرستونش کلاسِ خودش را دارد و گرفتنِ کلاسِ
  // `head` قاعدهٔ شش‌ستونهٔ `.bills-table` را رویش می‌انداخت.
  const gridHead = Array.from(root.children).find((child) => (
    child.classList?.contains('head') || child.hasAttribute?.('data-rt-head')
  ));
  if (gridHead) {
    return Array.from(gridHead.children).map((cell) => cell.textContent.trim());
  }

  return [];
};

// شمارِ سلول‌های اولین ردیفِ داده — برای اینکه بفهمیم عنوان‌ها با ستون‌ها
// می‌خوانند یا نه.
const countBodyCells = (root) => {
  const bodyRow = root.tagName === 'TABLE' ? root.querySelector(':scope > tbody > tr') : null;
  if (bodyRow) return bodyRow.children.length;

  const gridRow = Array.from(root.children).find((child) => child.classList?.contains('row'));
  return gridRow ? gridRow.children.length : 0;
};

// هر جدولی که زیر این عنصر هست، به‌علاوهٔ خودِ عنصر اگر خودش یک جدولِ گریدی
// باشد. متغیرها روی خودِ هر جدول نوشته می‌شوند نه روی رَپِر، تا یک رَپِر بتواند
// چند جدول را با عنوان‌های متفاوتِ خودشان بپوشاند — صفحهٔ مالی دولتی پانزده
// جدول دارد و وصل کردنِ تک‌تک‌شان یعنی پانزده تغییر در یک فایلِ ۸٬۶۰۰ خطی.
const collectTables = (root) => {
  const targets = Array.from(root.querySelectorAll('table, .finance-table'));
  if (root.classList.contains('finance-table')) targets.unshift(root);
  return targets;
};

// `as` هست چون این کامپوننت اغلب جای یک عنصرِ موجود می‌نشیند و نباید نوعش را
// عوض کند: بعضی صفحات ریشه‌شان `<section>` یا `<main>` است و هم CSS به آن تکیه
// دارد (`section.academy-page`) و هم `<main>` برای دسترس‌پذیری معنی دارد.
export default function ResponsiveTable({ as: Tag = 'div', className = '', children, ...rest }) {
  const ref = useRef(null);

  // بدون آرایهٔ وابستگی: بعد از هر رندر دوباره خوانده می‌شود. خواندنِ حداکثر ۱۲
  // سلولِ عنوان آن‌قدر ارزان است که ارزشِ ردیابیِ تغییرِ عنوان‌ها را ندارد.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    collectTables(element).forEach((table) => {
      const headerLabels = readHeaderLabels(table);
      const bodyCells = countBodyCells(table);

      // عنوان‌های بیشتر از سلول‌ها یعنی نگاشت جابه‌جا می‌شود. برعکسش اشکالی
      // ندارد: ستونِ عملیات در `.finance-table` عنوانی در `.head` ندارد و فقط
      // بدونِ برچسب می‌ماند. (ردیفِ داده‌ای هنوز نیامده؟ عنوان‌ها نوشته
      // می‌شوند؛ رندرِ بعدی دوباره بررسی می‌کند.)
      const labels = (bodyCells > 0 && headerLabels.length > bodyCells) ? [] : headerLabels;

      for (let index = 1; index <= MAX_LABELLED_COLUMNS; index += 1) {
        const text = labels[index - 1];
        if (text) {
          // JSON.stringify رشتهٔ نقل‌قول‌دار می‌سازد که `content` در CSS
          // می‌خواهد، و نقل‌قول و بک‌اسلشِ داخل متن را هم درست فرار می‌دهد.
          table.style.setProperty(`--rt-${index}`, JSON.stringify(text));
        } else {
          // ستونِ بی‌عنوان: متغیر تعریف‌نشده می‌ماند تا `content` بی‌اعتبار شود
          // و اصلاً `::before` ساخته نشود — بهتر از برچسبِ خالی که فاصله
          // می‌گیرد.
          table.style.removeProperty(`--rt-${index}`);
        }
      }
    });
  });

  return (
    <Tag ref={ref} className={['rt', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}
