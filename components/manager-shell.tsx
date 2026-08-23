'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { getBrowserClient } from '@/lib/supabase-browser';

export type ManagerUser = { name: string; role: 'admin' | 'manager'; locationName?: string | null; allLocations?: boolean; canManageEmployees?: boolean };

export default function ManagerShell({ brand, title, user, children }: { brand: string; title: string; user: ManagerUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = [
    { href: user.role === 'admin' ? '/admin' : '/manager', label: user.role === 'admin' ? 'BM OS Overview' : 'Dashboard', show: true },
    { href: '/manager', label: 'BM Time', show: user.role === 'admin' },
    { href: '/admin/academy', label: 'BM Academy', show: user.role === 'admin' || Boolean(user.canManageEmployees) },
    { href: '/admin/timecards', label: 'Timecards', show: true },
    { href: '/admin/employees', label: 'Employees', show: user.role === 'admin' || Boolean(user.canManageEmployees) },
    { href: '/admin/onboarding', label: 'Onboarding', show: user.role === 'admin' || Boolean(user.canManageEmployees) },
    { href: '/admin/managers', label: 'Managers', show: user.role === 'admin' },
    { href: '/admin/access', label: 'Identity & Access', show: user.role === 'admin' },
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
    <nav>{links.filter(link => link.show).map(link => <Link key={link.href} href={link.href} className={pathname === link.href ? 'active' : ''}>{link.label}</Link>)}</nav>
    <div className="sidebarFooter"><div className="signedInAs"><strong>{user.name}</strong>{user.role === 'manager' && !user.allLocations && user.locationName && <span>{user.locationName}</span>}</div><Link href="/kiosk">Open Kiosk</Link><button type="button" onClick={logout}>Log Out</button></div>
  </aside><div className="managerContent"><header className="contentHeader"><h1>{title}</h1></header>{children}</div></main>;
}
