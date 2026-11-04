import React, { useId } from 'react';
import { isResultMultiplier, resultMultipliers, type ResultMultiplier } from '../../shared/bilac-multipliers';

export default function BiLacResultMode({ value, onChange, disabled = false, choices = resultMultipliers }: {
  value: ResultMultiplier;
  onChange: (value: ResultMultiplier) => void;
  disabled?: boolean;
  choices?: readonly number[];
}) {
  const id = useId();
  const factors = choices.filter(isResultMultiplier).filter(factor => factor > 1);
  const options = factors.includes(value) || value === 1 ? factors : [...factors, value];
  return <fieldset disabled={disabled} className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
    <legend className="px-1 text-sm font-semibold text-stone-800">Cách tính kết quả</legend>
    <div className="grid grid-cols-2 gap-2">
      <label className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer ${value === 1 ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-stone-200 text-stone-600'}`}>
        <input type="radio" name={id} value="1" checked={value === 1} onChange={() => onChange(1)} className="h-4 w-4 shrink-0 accent-orange-600" /><span className="text-sm font-semibold">Thường · 1 trận</span>
      </label>
      <label className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer ${value > 1 ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-stone-200 text-stone-600'}`}>
        <input type="radio" name={id} value="star" checked={value > 1} onChange={() => onChange(factors[0] ?? 2)} disabled={!factors.length} className="h-4 w-4 shrink-0 accent-orange-600" /><span className="text-sm font-semibold">Ngôi sao tuyệt vọng</span>
      </label>
    </div>
    {value > 1 && <div className="flex items-center justify-between gap-3">
      <label htmlFor={id + '-factor'} className="text-sm font-semibold text-stone-700">Hệ số kết quả</label>
      <select id={id + '-factor'} value={value} onChange={event => { const next = Number(event.target.value); if (isResultMultiplier(next)) onChange(next); }} className="min-h-11 rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-bold text-orange-800">
        {options.map(factor => <option key={factor} value={factor}>×{factor}{factor === 10 ? ' (cũ)' : ''}</option>)}
      </select>
    </div>}
    <p className="text-xs leading-relaxed text-stone-500">{value > 1 ? `Chơi 1 trận. Khi chốt kết quả, lưu tổng cộng ${value} trận cùng đội và tỉ số. BXH tính đủ ${value} trận.` : 'Chơi 1 trận và tính 1 kết quả như bình thường.'}</p>
  </fieldset>;
}
