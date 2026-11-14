import { createElement, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { C, F, Icon, Segmented } from './kit';
import { MINUTES, fmtDate, to12h, withDay, withTime } from '@/lib/eventTime';

type Open = 'date' | 'hour' | 'minute' | null;
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Start time as three fields: Date (system calendar), Hour (1-12) and Minutes (:00/:15/:30/:45),
 * plus AM/PM. Local time.
 */
export function StartTimePicker({ value, onChange, invalid }: { value: Date; onChange: (d: Date) => void; invalid?: boolean }) {
  const [open, setOpen] = useState<Open>(null);
  const { hour, pm } = to12h(value.getHours());
  const minute = value.getMinutes();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function openDate() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate: today,
        onChange: (e, d) => e.type === 'set' && d && onChange(withDay(value, d)),
      });
      return;
    }
    setOpen(open === 'date' ? null : 'date');
  }

  const border = invalid ? C.red : C.line;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {Platform.OS === 'web' ? (
          <WebDate value={value} min={today} onChange={(d) => onChange(withDay(value, d))} border={border} />
        ) : (
          <FieldButton flex={1.9} label="Date" icon="calendar" text={fmtDate(value)} active={open === 'date'} border={border} onPress={openDate} />
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FieldButton flex={1} label="Hour" text={String(hour)} active={open === 'hour'} border={border} onPress={() => setOpen(open === 'hour' ? null : 'hour')} />
        <Text style={{ fontFamily: F.display, fontSize: 22, color: C.muted }}>:</Text>
        <FieldButton flex={1} label="Minutes" text={pad(minute)} active={open === 'minute'} border={border} onPress={() => setOpen(open === 'minute' ? null : 'minute')} />
        <View style={{ flex: 1.3 }}>
          <Segmented soft label="AM or PM" value={pm ? 'pm' : 'am'} options={[{ value: 'am', label: 'AM' }, { value: 'pm', label: 'PM' }]} onChange={(v) => onChange(withTime(value, hour, minute, v === 'pm'))} />
        </View>
      </View>

      {open === 'date' && Platform.OS === 'ios' && (
        <View style={{ backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 8 }}>
          <DateTimePicker
            value={value}
            mode="date"
            display="inline"
            minimumDate={today}
            accentColor={C.accent}
            themeVariant="light"
            onChange={(_, d) => {
              if (d) onChange(withDay(value, d));
              setOpen(null);
            }}
          />
        </View>
      )}
      {open === 'hour' && (
        <Grid
          label="Hour"
          options={HOURS.map((h) => ({ key: h, label: String(h) }))}
          selected={hour}
          columns={6}
          onPick={(h) => {
            onChange(withTime(value, h, minute, pm));
            setOpen(null);
          }}
        />
      )}
      {open === 'minute' && (
        <Grid
          label="Minutes"
          options={MINUTES.map((m) => ({ key: m, label: `:${pad(m)}` }))}
          selected={minute}
          columns={4}
          onPick={(m) => {
            onChange(withTime(value, hour, m, pm));
            setOpen(null);
          }}
        />
      )}
    </View>
  );
}

function FieldButton({ label, text, icon, active, border, flex, onPress }: { label: string; text: string; icon?: 'calendar'; active: boolean; border: string; flex: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${text}`}
      accessibilityState={{ expanded: active }}
      onPress={onPress}
      style={({ pressed }) => ({ flex, minHeight: 58, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: C.card, borderWidth: active ? 2 : 1, borderColor: active ? C.accent : border, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontFamily: F.body, fontSize: 12, color: C.muted }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon && <Icon name={icon} size={15} color={C.accent} />}
        <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>{text}</Text>
        <View style={{ flex: 1 }} />
        <Icon name="chevron-down" size={15} color={C.muted} />
      </View>
    </Pressable>
  );
}

function Grid<T extends number>({ label, options, selected, columns, onPick }: { label: string; options: { key: T; label: string }[]; selected: T; columns: number; onPick: (v: T) => void }) {
  return (
    <View accessibilityLabel={`Choose ${label.toLowerCase()}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10, backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line }}>
      {options.map((o) => {
        const on = o.key === selected;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label} ${o.label}`}
            onPress={() => onPick(o.key)}
            style={({ pressed }) => ({ flexBasis: `${100 / columns - 3}%`, flexGrow: 1, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.accent : C.field, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: on ? C.onAccent : C.ink }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Web has no native picker module: use the browser's own date input. */
function WebDate({ value, min, onChange, border }: { value: Date; min: Date; onChange: (d: Date) => void; border: string }) {
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return (
    <View style={{ flex: 1, minHeight: 58, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: border, justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.body, fontSize: 12, color: C.muted }}>Date</Text>
      {createElement('input', {
        type: 'date',
        'aria-label': 'Date',
        value: iso(value),
        min: iso(min),
        onChange: (e: { target: { value: string } }) => {
          const [y, m, d] = e.target.value.split('-').map(Number);
          if (y && m && d) onChange(new Date(y, m - 1, d));
        },
        style: { border: 'none', outline: 'none', background: 'transparent', fontFamily: F.bodyBold, fontSize: 16, color: C.ink, padding: 0 },
      })}
    </View>
  );
}
