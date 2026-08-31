import AfghanDateInput from './ui/AfghanDateInput';
import { AFGHAN_STUDENT_SECTIONS } from '../config/afghanStudentFields';
import './AfghanStudentFieldGrid.css';

// خانه‌های type: 'latin' باید «انگلیسی برویت تذکره» باشند. خیلی از پرونده‌ها اصلاً
// نامِ انگلیسی ندارند و هنگام ثبت‌نام نامِ دری در این خانه نشسته؛ در حالتِ نمایش
// (latinGuard) به‌جای نشان‌دادنِ متنِ دری به‌عنوانِ «انگلیسی»، خانه را خالی نشان بده.
const hasArabicScript = (value = '') => /\p{Script=Arabic}/u.test(String(value || ''));
const isDariInLatinField = (field, value) => field.type === 'latin' && hasArabicScript(value) && !/[A-Za-z]/.test(String(value || ''));

/**
 * گریدِ مشترکِ فیلدهای «کارت سوانح متعلم». همان فیلدها/برچسب‌ها/ترتیب در هر سه فرم.
 * @param {object}   props.values      { fieldKey: string }
 * @param {function} props.onChange    (fieldKey, value) => void
 * @param {'light'|'glass'} [props.theme='light']
 * @param {boolean}  [props.readOnly]
 * @param {string[]} [props.sectionIds] محدودکردن به بخش‌های مشخص (پیش‌فرض: همه)
 * @param {object}   [props.errors]    { fieldKey: string } پیامِ خطای هر فیلد
 * @param {boolean}  [props.latinGuard] خانه‌های انگلیسیِ حاویِ متنِ دری را خالی نشان بده (فقط نمایش)
 */
export default function AfghanStudentFieldGrid({
  values = {},
  onChange,
  theme = 'light',
  readOnly = false,
  sectionIds = null,
  errors = {},
  latinGuard = false
}) {
  const sections = sectionIds
    ? AFGHAN_STUDENT_SECTIONS.filter((section) => sectionIds.includes(section.id))
    : AFGHAN_STUDENT_SECTIONS;

  return (
    <div className={`asf-grid asf-${theme}`} dir="rtl">
      {sections.map((section) => (
        <fieldset className="asf-section" key={section.id}>
          <legend>{section.title}</legend>
          <div className="asf-fields">
            {section.fields.map((field) => {
              const rawValue = values[field.key] ?? '';
              const guarded = latinGuard && isDariInLatinField(field, rawValue);
              const value = guarded ? '' : rawValue;
              const common = {
                id: `asf-${field.key}`,
                value,
                disabled: readOnly,
                ...(guarded ? { placeholder: 'ثبت نشده' } : {}),
                onChange: (event) => onChange && onChange(field.key, event.target.value)
              };
              return (
                <label className="asf-field" key={field.key} htmlFor={common.id}>
                  <span className="asf-label">
                    {field.label}
                    {field.required ? <em className="asf-req"> *</em> : null}
                  </span>
                  {field.type === 'select' ? (
                    <select {...common}>
                      <option value="">—</option>
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : field.type === 'date' ? (
                    <AfghanDateInput
                      id={common.id}
                      value={value}
                      disabled={readOnly}
                      onChange={(next) => onChange && onChange(field.key, next)}
                      showGregorianEquivalent
                    />
                  ) : (
                    <input type="text" dir={field.type === 'latin' ? 'ltr' : undefined} {...common} />
                  )}
                  {guarded ? (
                    <em className="asf-warn">نامِ انگلیسی برویت تذکره ثبت نشده (مقدارِ قبلی دری بود).</em>
                  ) : null}
                  {errors[field.key] ? <em className="asf-error">{errors[field.key]}</em> : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
