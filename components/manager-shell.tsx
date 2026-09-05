'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { getBrowserClient } from '@/lib/supabase-browser';

export type ManagerUser = { name: string; role: 'admin' | 'manager'; locationName?: string | null; allLocations?: boolean; canManageEmployees?: boolean };

export default function ManagerShell({ brand, title, user, children }: { brand: string; title: string; user: ManagerUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isOsOverview = pathname === '/admin';
  const links = isOsOverview ? [
    { href: '/manager', label: 'BM Time', show: true },
    { href: '/academy', label: 'BM Academy', show: true },
    { href: '/api/auth/warehouse-handoff', label: 'BM Warehouse', show: true },
    { href: '/api/auth/prospecting-handoff', label: 'BM Prospecting', show: true },
  ] : [
    { href: '/manager', label: 'Home', show: true },
    { href: '/admin/timecards', label: 'Timecards', show: true },
    { href: '/admin/employees', label: 'People', show: user.role === 'admin' || Boolean(user.canManageEmployees) },
    { href: '/admin/academy', label: 'Academy', show: user.role === 'admin' || Boolean(user.canManageEmployees) },
    { href: '/admin/access', label: 'Access & Permissions', show: user.role === 'admin' },
  ];
  async function logout() {
    await Promise.allSettled([
      getBrowserClient().auth.signOut(),
      fetch('/api/auth/logout', { method: 'POST' }),
    ]);
    router.replace('/');
    router.refresh();
  }
  return <main className="managerApp"><aside className="managerSidebar">
    <div><div className="brand">{brand}</div><div className="sidebarLabel">Management</div></div>
    <nav aria-label={isOsOverview ? 'Your systems' : 'BM Time'}>{links.filter(link => link.show).map(link => <Link key={link.href} href={link.href} className={pathname === link.href ? 'active' : ''}>{link.label}</Link>)}</nav>
    <div className="sidebarFooter"><div className="signedInAs"><strong>{user.name}</strong>{user.role === 'manager' && !user.allLocations && user.locationName && <span>{user.locationName}</span>}</div>{!isOsOverview && user.role === 'admin' && <Link href="/admin">Back to BM OS</Link>}<Link href="/kiosk">Open Kiosk</Link><button type="button" onClick={logout}>Log Out</button></div>
  </aside><div className="managerContent"><header className="contentHeader"><h1>{title}</h1></header>{children}</div></main>;
}
