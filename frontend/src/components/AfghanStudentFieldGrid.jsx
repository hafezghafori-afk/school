import AfghanDateInput from './ui/AfghanDateInput';
import { AFGHAN_STUDENT_SECTIONS } from '../config/afghanStudentFields';
import './AfghanStudentFieldGrid.css';

/**
 * گریدِ مشترکِ فیلدهای «کارت سوانح متعلم». همان فیلدها/برچسب‌ها/ترتیب در هر سه فرم.
 * @param {object}   props.values      { fieldKey: string }
 * @param {function} props.onChange    (fieldKey, value) => void
 * @param {'light'|'glass'} [props.theme='light']
 * @param {boolean}  [props.readOnly]
 * @param {string[]} [props.sectionIds] محدودکردن به بخش‌های مشخص (پیش‌فرض: همه)
 * @param {object}   [props.errors]    { fieldKey: string } پیامِ خطای هر فیلد
 */
export default function AfghanStudentFieldGrid({
  values = {},
  onChange,
  theme = 'light',
  readOnly = false,
  sectionIds = null,
  errors = {}
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
              const value = values[field.key] ?? '';
              const common = {
                id: `asf-${field.key}`,
                value,
                disabled: readOnly,
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
