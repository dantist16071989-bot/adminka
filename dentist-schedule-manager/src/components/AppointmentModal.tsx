import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export default function AppointmentModal({ appointment, onClose, onUpdate }: { appointment: any, onClose: () => void, onUpdate: () => void }) {
  const initialTime = formatInTimeZone(new Date(appointment.requested_time), 'Europe/Kyiv', "yyyy-MM-dd'T'HH:mm");
  const [status, setStatus] = useState(appointment.status);
  const [notes, setNotes] = useState(appointment.notes || '');
  const [requestedTime, setRequestedTime] = useState(initialTime);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdate = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const startUtc = fromZonedTime(requestedTime, 'Europe/Kyiv').toISOString();
      const ACTIVE = ['pending', 'confirmed'];
      const timeChanged = requestedTime !== initialTime;
      const becomesActive = ACTIVE.includes(status) && !ACTIVE.includes(appointment.status);
      const needsCheck = ACTIVE.includes(status) && (timeChanged || becomesActive);

      if (needsCheck) {
        const { data: reason, error: checkError } = await supabase.rpc('check_availability_reason', {
          requested_start: startUtc,
          duration_minutes: appointment.estimated_duration_minutes || 30,
          p_exclude_id: appointment.id
        });

        if (checkError) {
          setError("Не вдалося перевірити доступність: " + checkError.message);
          return;
        }

        if (reason !== 'ok') {
          const errorMessages: Record<string, string> = {
            day_off: "Це вихідний день — прийому немає",
            outside_hours: "Час поза робочим графіком лікаря (або запис не вміщується до кінця зміни)",
            conflict: "Цей час вже зайнятий іншим записом",
          };
          setError(errorMessages[reason as string] || "Час недоступний");
          return;
        }
      }

      const { error: updateError } = await supabase.from('appointments').update({ 
        status, 
        notes,
        requested_time: startUtc
      }).eq('id', appointment.id);

      if (updateError) {
        console.error(updateError);
        setError("Помилка при збереженні: " + updateError.message);
        return;
      }

      onUpdate();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white p-4 rounded w-96 max-w-full">
        <h2 className="text-lg font-bold mb-4">Редагувати запис</h2>
        {error && <p className="text-red-500 mb-2">{error}</p>}
        {isSaving && <p className="text-blue-500 mb-2">Збереження...</p>}
        <p className="mb-2">Пацієнт: {appointment.patient_name}</p>
        <input 
          type="datetime-local" 
          value={requestedTime} 
          onChange={(e) => setRequestedTime(e.target.value)} 
          className="w-full p-2 mb-2 border rounded" 
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full p-2 mb-2 border rounded">
          <option value="pending">Очікує</option>
          <option value="confirmed">Підтверджено</option>
          <option value="declined">Відхилено</option>
          <option value="completed">Завершено</option>
          <option value="cancelled">Скасовано</option>
        </select>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-2 mb-2 border rounded" placeholder="Примітки" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="p-2 bg-gray-200 rounded" disabled={isSaving}>Скасувати</button>
          <button onClick={handleUpdate} className="p-2 bg-blue-600 text-white rounded" disabled={isSaving}>Зберегти</button>
        </div>
      </div>
    </div>
  );
}
