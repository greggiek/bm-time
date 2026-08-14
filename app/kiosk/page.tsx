'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type EmployeeState = {
  employeeId: string;
  firstName: string;
  status: 'clocked_in' | 'clocked_out';
  breakStartedAt: string | null;
};

type Warehouse = {
  kioskId: string;
  name: string;
};

export default function KioskPage() {
  const [pin, setPin] = useState('');
  const [now, setNow] = useState(new Date());
  const [employee, setEmployee] = useState<EmployeeState | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<{ title: string; time: string } | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedKioskId, setSelectedKioskId] = useState('');
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const kioskToken = process.env.NEXT_PUBLIC_KIOSK_TOKEN || '';

  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.kioskId === selectedKioskId),
    [selectedKioskId, warehouses],
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWarehouses() {
      setLoadingWarehouses(true);
      setMessage('');
      try {
        const response = await fetch('/api/kiosks', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kioskToken }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load warehouses.');
        if (cancelled) return;
        setWarehouses(data.warehouses || []);
        setSelectedKioskId(data.defaultKioskId || data.warehouses?.[0]?.kioskId || '');
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Unable to load warehouses.');
        }
      } finally {
        if (!cancelled) setLoadingWarehouses(false);
      }
    }

    loadWarehouses();
    return () => {
      cancelled = true;
    };
  }, [kioskToken]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(reset, 3000);
    return () => clearTimeout(timer);
  }, [success]);

  function reset() {
    setPin('');
    setEmployee(null);
    setMessage('');
    setSuccess(null);
    setBusy(false);
  }

  async function send(action: 'identify' | 'clock_in' | 'clock_out' | 'start_break' | 'end_break') {
    if (!selectedKioskId) {
      setMessage('Select a warehouse before continuing.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/punch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pin,
          action,
          employeeId: employee?.employeeId,
          kioskToken,
          kioskId: selectedKioskId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to continue.');
      if (action === 'identify') setEmployee(data);
      else if (action === 'start_break') setEmployee((current) => current ? { ...current, breakStartedAt: data.breakStartedAt } : current);
      else {
        setSuccess({
          title: action === 'clock_in' ? 'CLOCKED IN' : action === 'end_break' ? 'BREAK ENDED' : 'CLOCKED OUT',
          time: new Date(data.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to continue.');
    } finally {
      setBusy(false);
    }
  }

  function digit(value: string) {
    if (!employee && pin.length < 4) setPin(pin + value);
  }

  function breakTime(startedAt: string) {
    const seconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  if (success) {
    return (
      <main className="shell">
        <section className="card success">
          <div className="check">✓</div>
          <h1>{success.title}</h1>
          <div className="successTime">{success.time}</div>
          <p>{selectedWarehouse?.name}</p>
          <p>Have a good {success.title === 'CLOCKED IN' ? 'shift' : 'day'}.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="card kioskCard">
        <div className="topline">
          <div>
            <div className="brand">BM TIME</div>
            <div className="location">{selectedWarehouse?.name || 'Select warehouse'}</div>
          </div>
          <div className="date">
            {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>

        <label className="warehousePicker">
          Warehouse
          <select
            value={selectedKioskId}
            onChange={(event) => {
              reset();
              setSelectedKioskId(event.target.value);
            }}
            disabled={loadingWarehouses || busy || Boolean(employee)}
          >
            <option value="" disabled>
              {loadingWarehouses ? 'Loading warehouses…' : 'Select warehouse'}
            </option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.kioskId} value={warehouse.kioskId}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </label>

        <div className="clock">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>

        {!employee ? (
          <>
            <h1 className="prompt">Enter Employee PIN</h1>
            <div className="pinDots">
              {[0, 1, 2, 3].map((index) => (
                <span key={index} className={index < pin.length ? 'filled' : ''} />
              ))}
            </div>
            <div className="keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((number) => (
                <button key={number} onClick={() => digit(number)}>{number}</button>
              ))}
              <button className="quiet" onClick={() => setPin('')}>Clear</button>
              <button onClick={() => digit('0')}>0</button>
              <button className="quiet" onClick={() => setPin(pin.slice(0, -1))}>⌫</button>
            </div>
            <button
              className="primary"
              disabled={pin.length !== 4 || busy || !selectedKioskId}
              onClick={() => send('identify')}
            >
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </>
        ) : (
          <div className="employeePanel">
            <p className="welcome">Welcome, <strong>{employee.firstName}</strong></p>
            <div className="status">
              Status: <strong>{employee.breakStartedAt ? 'On Break' : employee.status === 'clocked_in' ? 'Clocked In' : 'Clocked Out'}</strong>
            </div>
            {employee.breakStartedAt ? <><div className="breakTimer"><span>Break time</span><strong>{breakTime(employee.breakStartedAt)}</strong></div><button className="breakEnd" disabled={busy} onClick={() => send('end_break')}>{busy ? 'Saving…' : 'End Break'}</button></> : <><button
              className={employee.status === 'clocked_in' ? 'danger' : 'primary'}
              disabled={busy}
              onClick={() => send(employee.status === 'clocked_in' ? 'clock_out' : 'clock_in')}
            >
              {busy ? 'Saving…' : employee.status === 'clocked_in' ? 'Clock Out' : 'Clock In'}
            </button>{employee.status === 'clocked_in' && <button className="breakStart" disabled={busy} onClick={() => send('start_break')}>Start Break</button>}</>}
            <button className="cancel" onClick={reset}>Cancel</button>
          </div>
        )}

        {message && <div className="error">{message}</div>}
        <div className="demoNote">
          {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? 'Demo PINs: 1234, 2468, 7300' : ''}
        </div>
        {!employee && (
          <div className="kioskManagerExit">
            <Link href="/manager">Manager Portal</Link>
            <span>Manager PIN required</span>
          </div>
        )}
      </section>
    </main>
  );
}
