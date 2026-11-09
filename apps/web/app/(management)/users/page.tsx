'use client';
import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Check } from 'lucide-react';
import { PERMISSIONS, ROLE_LABELS, passwordSchema, userCreateSchema, userUpdateSchema, type RoleCode } from '@tanda/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { ServerTable } from '@/components/data-table';
import { PageHeader, Panel, PanelHeader, Skeleton } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { ApiErrorBox, emptyToNull, useAreas, useOrgTree } from '@/features/ops/common';

type User = { id: string; email: string; fullName: string; phone: string | null; isActive: boolean; regionId: string | null; areaId: string | null; lastLoginAt: string | null; roles: string[]; region: { name: string } | null; area: { name: string } | null };
type Role = { id: string; code: string; name: string; description: string | null; isSystem: boolean; userCount: number; permissions: string[] };
const label = (r: string) => ROLE_LABELS[r as RoleCode] ?? r;

function RolePicker({ roles, value, onChange }: { roles: Role[]; value: string[]; onChange: (v: string[]) => void }) {
  return <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-2 sm:grid-cols-3">{roles.map((r) => <label key={r.code} className="flex items-center gap-1.5 text-sm">
    <input type="checkbox" checked={value.includes(r.code)} onChange={(e) => onChange(e.target.checked ? [...value, r.code] : value.filter((x) => x !== r.code))} />{r.name}</label>)}</div>;
}

function UserDialog({ user, roles, onClose }: { user?: User; roles: Role[]; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const tree = useOrgTree(); const areas = useAreas();
  const schema = user ? userUpdateSchema : userCreateSchema;
  const form = useForm<Record<string, unknown>>({ resolver: zodResolver(schema as never), defaultValues: user ? { fullName: user.fullName, phone: user.phone, roleCodes: user.roles, regionId: user.regionId, areaId: user.areaId, isActive: user.isActive } : { roleCodes: [] } });
  const m = useMutation({ mutationFn: (v: Record<string, unknown>) => user ? api(`/users/${user.id}`, { method: 'PATCH', body: v }) : api('/users', { method: 'POST', body: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); qc.invalidateQueries({ queryKey: ['roles'] }); toast('success', user ? 'User updated' : 'User created'); onClose(); } });
  const e = form.formState.errors as Record<string, { message?: string }>;
  const roleCodes = (form.watch('roleCodes') as string[]) ?? []; const isActive = form.watch('isActive');
  return <Dialog open onOpenChange={(o) => !o && onClose()} title={user ? `Edit ${user.fullName}` : 'Create user'} size="lg"
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v))}>{user ? 'Save' : 'Create user'}</Button></>}>
    <ApiErrorBox error={m.error} />
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => ev.preventDefault()}>
      {!user && <Field label="Email" required error={e.email?.message}><Input type="email" autoComplete="off" {...form.register('email')} /></Field>}
      <Field label="Full name" required error={e.fullName?.message}><Input {...form.register('fullName')} /></Field>
      <Field label="Phone"><Input {...form.register('phone', { setValueAs: emptyToNull })} /></Field>
      {!user && <Field label="Initial password" required error={e.password?.message} hint="≥ 10 chars, upper, lower, digit"><Input type="password" autoComplete="new-password" {...form.register('password')} /></Field>}
      <Field className="sm:col-span-2" label="Roles" required error={e.roleCodes?.message}><RolePicker roles={roles} value={roleCodes} onChange={(v) => form.setValue('roleCodes', v, { shouldValidate: true })} /></Field>
      <Field label="Region scope" hint="Required for Regional Manager"><Select {...form.register('regionId', { setValueAs: emptyToNull })}><option value="">— National</option>{(tree.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
      <Field label="Area scope" hint="Required for Area Manager / Supervisor"><Select {...form.register('areaId', { setValueAs: emptyToNull })}><option value="">—</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
      {user && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" {...form.register('isActive')} /> Account active</label>}
      {user && user.isActive && isActive === false && <p className="rounded bg-warn-soft px-3 py-2 text-xs text-warn-text sm:col-span-2">Deactivating blocks login immediately and revokes all of this user's active sessions.</p>}
    </form></Dialog>;
}

function ResetDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const toast = useToast(); const s = z.object({ password: passwordSchema });
  const form = useForm<z.input<typeof s>>({ resolver: zodResolver(s) });
  const m = useMutation({ mutationFn: (v: z.output<typeof s>) => api(`/users/${user.id}/reset-password`, { method: 'POST', body: v }), onSuccess: () => { toast('success', 'Password reset – sessions revoked'); onClose(); } });
  return <Dialog open onOpenChange={(o) => !o && onClose()} title={`Reset password – ${user.fullName}`} size="sm"
    footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={form.handleSubmit((v) => m.mutate(v as z.output<typeof s>))}>Reset</Button></>}>
    <ApiErrorBox error={m.error} /><Field label="New password" required error={form.formState.errors.password?.message}><Input type="password" autoComplete="new-password" {...form.register('password')} /></Field></Dialog>;
}

export default function UsersPage() {
  const { can } = useAuth();
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles') });
  const perms = useQuery({ queryKey: ['permissions'], queryFn: () => api<{ code: string; module: string }[]>('/roles/permissions') });
  const [roleFilter, setRoleFilter] = useState(''); const [active, setActive] = useState('');
  const [edit, setEdit] = useState<User | 'new' | null>(null); const [reset, setReset] = useState<User | null>(null);
  const manage = can(PERMISSIONS.USERS_MANAGE);
  const columns: ColumnDef<User, unknown>[] = [
    { id: 'fullName', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span> },
    { id: 'email', header: 'Email', accessorKey: 'email' },
    { id: 'roles', header: 'Roles', cell: ({ row }) => <span className="flex flex-wrap gap-1">{row.original.roles.map((r) => <Badge key={r} tone="info">{label(r)}</Badge>)}</span> },
    { id: 'scope', header: 'Scope', cell: ({ row }) => row.original.area?.name ?? row.original.region?.name ?? 'National' },
    { id: 'lastLoginAt', header: 'Last login', cell: ({ row }) => fmtDateTime(row.original.lastLoginAt) },
    { id: 'active', header: 'Status', cell: ({ row }) => row.original.isActive ? <Badge tone="good" icon>Active</Badge> : <Badge tone="critical" icon>Inactive</Badge> },
    ...(manage ? [{ id: 'a', header: '', cell: ({ row }: { row: { original: User } }) => <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEdit(row.original)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setReset(row.original)}>Reset password</Button></span> } as ColumnDef<User, unknown>] : []),
  ];
  const modules = [...new Set((perms.data ?? []).map((p) => p.module))];
  return <>
    <PageHeader title="User management" description="Accounts, roles (RBAC) and territorial scope" actions={manage && <Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Create user</Button>} />
    <Tabs defaultValue="users"><TabsList><TabsTrigger value="users">Users</TabsTrigger><TabsTrigger value="roles">Roles & permissions</TabsTrigger></TabsList>
      <TabsContent value="users"><Panel>
        <ServerTable<User> queryKey={['users']} endpoint="/users" columns={columns} sortable={['fullName', 'email', 'lastLoginAt']} searchPlaceholder="Search name or email…" params={{ role: roleFilter || undefined, isActive: active || undefined }}
          toolbar={<><Select aria-label="Role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-8 w-auto text-xs"><option value="">Role: all</option>{(roles.data ?? []).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</Select>
            <Select aria-label="Active" value={active} onChange={(e) => setActive(e.target.value)} className="h-8 w-auto text-xs"><option value="">Status: all</option><option value="true">Active</option><option value="false">Inactive</option></Select></>} />
      </Panel></TabsContent>
      <TabsContent value="roles"><Panel><PanelHeader title="Permission matrix" subtitle="System roles are defined by the RBAC catalogue (read-only). Data scope (own / team / area / region / national) is applied on top of permissions." />
        {roles.isLoading || perms.isLoading ? <Skeleton className="m-4 h-60" /> : <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead className="bg-surface"><tr><th className="sticky left-0 bg-surface px-3 py-2 text-left font-semibold text-ink-muted">Permission</th>{(roles.data ?? []).map((r) => <th key={r.code} className="whitespace-nowrap px-2 py-2 font-semibold text-ink-muted" title={`${r.userCount} user(s)`}>{r.name}</th>)}</tr></thead>
          <tbody>{modules.map((mod) => <Fragment key={mod}>{[<tr key={mod} className="border-t border-border bg-slate-50"><td colSpan={(roles.data?.length ?? 0) + 1} className="px-3 py-1 font-semibold uppercase text-ink-secondary">{mod}</td></tr>,
            ...(perms.data ?? []).filter((p) => p.module === mod).map((p) => <tr key={p.code} className="border-t border-border"><td className="sticky left-0 bg-white px-3 py-1 font-mono">{p.code}</td>
              {(roles.data ?? []).map((r) => <td key={r.code} className="text-center">{r.permissions.includes(p.code) ? <Check className="mx-auto h-3.5 w-3.5 text-good-text" aria-label="granted" /> : <span className="text-slate-300" aria-label="not granted">·</span>}</td>)}</tr>)]}</Fragment>)}</tbody>
        </table></div>}</Panel></TabsContent>
    </Tabs>
    {edit && <UserDialog user={edit === 'new' ? undefined : edit} roles={roles.data ?? []} onClose={() => setEdit(null)} />}
    {reset && <ResetDialog user={reset} onClose={() => setReset(null)} />}
  </>;
}
