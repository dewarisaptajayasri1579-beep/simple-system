"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Select,
  Alert,
  FilterableTable,
  Switch,
} from "@/components/ui";
import {
  MasterDataPanel,
  type VendorRow,
  type LookupRow,
  type ServerRow,
  type MaintenanceRow,
  type CpanelAccountRow,
  type ClientRow,
  type DomainRow,
  type RecurringBillRow,
  type ItemRow,
  type LegacySalesClientRow,
} from "./MasterDataPanel";

export interface SettingsData {
  operasionalPct: number;
  direksiPct: number;
  bonusPct: number;
  defaultPpnRate: number;
  aiFollowUpEnabled: boolean;
  paymentBankNamePpn: string | null;
  paymentAccountNamePpn: string | null;
  paymentAccountNumberPpn: string | null;
  paymentBankNameNonPpn: string | null;
  paymentAccountNameNonPpn: string | null;
  paymentAccountNumberNonPpn: string | null;
  slottingOperasionalPct: number;
  slottingDireksiPct: number;
  slottingBonusPct: number;
  slottingHppReservePct: number;
  slottingOperasionalAccountId: string | null;
  slottingDireksiAccountId: string | null;
  slottingBonusAccountId: string | null;
  slottingHppReserveAccountId: string | null;
  slottingTransferFee: number;
}

export interface AccountOption {
  id: string;
  name: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  phoneNumber: string | null;
  modules: string[];
  isActive: boolean;
}

const MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: "internal", label: "Internal" },
  { value: "marketing", label: "Marketing" },
  { value: "monitoring", label: "Monitoring" },
];

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "direktur", label: "Direktur" },
  { value: "admin", label: "Admin" },
];

const TABS = [
  { value: "umum", label: "Umum" },
  { value: "user", label: "User" },
  { value: "master-data", label: "Master Data" },
  { value: "akses-coa", label: "Akses COA" },
  { value: "backup", label: "Backup" },
] as const;

// Role dibatasi (bukan owner) cuma boleh lihat tab ini — cocokkan sama restriksi halaman
// /pengaturan (requirePageRole) & sidebar (Sidebar.tsx filterNavItemsByRole).
const RESTRICTED_ROLE_TABS: (typeof TABS)[number]["value"][] = ["master-data"];

export interface CoaAccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PengaturanPanel: React.FC<{
  userRole: string;
  currentUserId: string;
  settings: SettingsData;
  users: UserRow[];
  domains: DomainRow[];
  recurringBills: RecurringBillRow[];
  clients: ClientRow[];
  legacySalesClients: LegacySalesClientRow[];
  items: ItemRow[];
  vendors: VendorRow[];
  cloudTypes: LookupRow[];
  hostingPackages: LookupRow[];
  servers: ServerRow[];
  maintenances: MaintenanceRow[];
  cpanelAccounts: CpanelAccountRow[];
  accounts: AccountOption[];
}> = ({
  userRole,
  currentUserId,
  settings,
  users: initialUsers,
  domains,
  recurringBills,
  clients,
  legacySalesClients,
  items,
  vendors,
  cloudTypes,
  hostingPackages,
  servers,
  maintenances,
  cpanelAccounts,
  accounts,
}) => {
  const router = useRouter();
  const isOwner = userRole === "owner";
  const visibleTabs = isOwner ? TABS : TABS.filter((t) => RESTRICTED_ROLE_TABS.includes(t.value));
  const [activeTab, setActiveTabState] = useState<(typeof TABS)[number]["value"]>(isOwner ? "umum" : "master-data");

  useEffect(() => {
    if (!isOwner) return; // role dibatasi selalu di Master Data, tidak ada tab lain buat direstore
    const saved = window.localStorage.getItem("pengaturan:tab");
    if (saved && TABS.some((t) => t.value === saved)) {
      setActiveTabState(saved as (typeof TABS)[number]["value"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveTab = (value: (typeof TABS)[number]["value"]) => {
    setActiveTabState(value);
    window.localStorage.setItem("pengaturan:tab", value);
  };
  const [operasionalPct, setOperasionalPct] = useState(settings.operasionalPct);
  const [direksiPct, setDireksiPct] = useState(settings.direksiPct);
  const [bonusPct, setBonusPct] = useState(settings.bonusPct);
  const [defaultPpnRate, setDefaultPpnRate] = useState(settings.defaultPpnRate);
  const [aiFollowUpEnabled, setAiFollowUpEnabled] = useState(settings.aiFollowUpEnabled);
  const [paymentBankNamePpn, setPaymentBankNamePpn] = useState(settings.paymentBankNamePpn ?? "");
  const [paymentAccountNamePpn, setPaymentAccountNamePpn] = useState(settings.paymentAccountNamePpn ?? "");
  const [paymentAccountNumberPpn, setPaymentAccountNumberPpn] = useState(settings.paymentAccountNumberPpn ?? "");
  const [paymentBankNameNonPpn, setPaymentBankNameNonPpn] = useState(settings.paymentBankNameNonPpn ?? "");
  const [paymentAccountNameNonPpn, setPaymentAccountNameNonPpn] = useState(settings.paymentAccountNameNonPpn ?? "");
  const [paymentAccountNumberNonPpn, setPaymentAccountNumberNonPpn] = useState(settings.paymentAccountNumberNonPpn ?? "");
  const [slottingOperasionalPct, setSlottingOperasionalPct] = useState(settings.slottingOperasionalPct);
  const [slottingDireksiPct, setSlottingDireksiPct] = useState(settings.slottingDireksiPct);
  const [slottingBonusPct, setSlottingBonusPct] = useState(settings.slottingBonusPct);
  const [slottingHppReservePct, setSlottingHppReservePct] = useState(settings.slottingHppReservePct);
  const [slottingOperasionalAccountId, setSlottingOperasionalAccountId] = useState(settings.slottingOperasionalAccountId ?? "");
  const [slottingDireksiAccountId, setSlottingDireksiAccountId] = useState(settings.slottingDireksiAccountId ?? "");
  const [slottingBonusAccountId, setSlottingBonusAccountId] = useState(settings.slottingBonusAccountId ?? "");
  const [slottingHppReserveAccountId, setSlottingHppReserveAccountId] = useState(settings.slottingHppReserveAccountId ?? "");
  const [slottingTransferFee, setSlottingTransferFee] = useState(settings.slottingTransferFee);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [users, setUsers] = useState(initialUsers);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [newModules, setNewModules] = useState<string[]>(["internal"]);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userMessage, setUserMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<string | null>(null);

  const totalPct = operasionalPct + direksiPct + bonusPct;
  const slottingTotalPct = slottingOperasionalPct + slottingDireksiPct + slottingBonusPct + slottingHppReservePct;

  const handleSaveSettings = async () => {
    setSettingsMessage(null);
    if (Math.abs(totalPct - 100) > 0.01) {
      setSettingsMessage({ type: "error", text: "Total persentase split harus 100%" });
      return;
    }
    if (Math.abs(slottingTotalPct - 100) > 0.01) {
      setSettingsMessage({ type: "error", text: "Total persentase Slotting Omset harus 100%" });
      return;
    }
    setIsSavingSettings(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operasionalPct,
        direksiPct,
        bonusPct,
        defaultPpnRate,
        aiFollowUpEnabled,
        paymentBankNamePpn,
        paymentAccountNamePpn,
        paymentAccountNumberPpn,
        paymentBankNameNonPpn,
        paymentAccountNameNonPpn,
        paymentAccountNumberNonPpn,
        slottingOperasionalPct,
        slottingDireksiPct,
        slottingBonusPct,
        slottingHppReservePct,
        slottingOperasionalAccountId,
        slottingDireksiAccountId,
        slottingBonusAccountId,
        slottingHppReserveAccountId,
        slottingTransferFee,
      }),
    });
    const data = await res.json();
    setIsSavingSettings(false);
    if (!res.ok) {
      setSettingsMessage({ type: "error", text: data.error || "Gagal menyimpan" });
      return;
    }
    setSettingsMessage({ type: "success", text: "Pengaturan tersimpan." });
    router.refresh();
  };

  const handleCreateUser = async () => {
    setUserMessage(null);
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      setUserMessage({ type: "error", text: "Nama, email, dan password wajib diisi" });
      return;
    }
    setIsSavingUser(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, role: newRole, phoneNumber: newPhone, modules: newModules }),
    });
    const data = await res.json();
    setIsSavingUser(false);
    if (!res.ok) {
      setUserMessage({ type: "error", text: data.error || "Gagal menyimpan user" });
      return;
    }
    setUsers((prev) => [...prev, data]);
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setNewPhone("");
    setNewRole("admin");
    setNewModules(["internal"]);
    setUserMessage({ type: "success", text: "User baru dibuat." });
  };

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleRunBackup = async () => {
    setIsBackingUp(true);
    setBackupMessage(null);
    const res = await fetch("/api/backup/run", { method: "POST" });
    const data = await res.json().catch(() => null);
    setIsBackingUp(false);
    if (!res.ok) {
      setBackupMessage({ type: "error", text: data?.error || "Backup gagal" });
      return;
    }
    setBackupMessage({
      type: "success",
      text: `${data.fileName} berhasil diunggah ke Google Drive (${data.tableCount} tabel, ${data.rowCount} baris, ${formatBytes(data.sizeBytes)}).`,
    });
  };

  const handleChangeRole = async (id: string, role: string) => {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    }
  };

  const handleToggleModule = async (id: string, moduleValue: string, checked: boolean) => {
    const target = users.find((u) => u.id === id);
    if (!target) return;
    const modules = checked ? [...new Set([...target.modules, moduleValue])] : target.modules.filter((m) => m !== moduleValue);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modules }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, modules } : u)));
    }
  };

  const handleChangePhone = async (id: string, phoneNumber: string) => {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, phoneNumber } : u)));
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    setUserMessage(null);
    setPendingDeactivate(null);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    const data = await res.json();
    if (!res.ok) {
      setUserMessage({ type: "error", text: data.error || "Gagal mengubah status user" });
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive } : u)));
    setUserMessage({
      type: "success",
      text: isActive ? "User diaktifkan kembali." : "User dinonaktifkan & sesi login-nya dicabut.",
    });
  };

  // Akses COA per Role — cuma dipakai owner, dan cuma buat role "admin" (Owner/Direktur selalu
  // bebas lihat semua akun, lihat catatan RoleCoaAccess di schema.prisma). Data COA + akses yang
  // sudah tersimpan baru di-fetch begitu tab-nya benar-benar dibuka (bukan langsung saat mount),
  // biar tidak nambah query kalau owner tidak pernah buka tab ini.
  const [coaAccounts, setCoaAccounts] = useState<CoaAccountOption[] | null>(null);
  const [selectedCoaIds, setSelectedCoaIds] = useState<Set<string>>(new Set());
  const [isLoadingCoaAccess, setIsLoadingCoaAccess] = useState(false);
  const [isSavingCoaAccess, setIsSavingCoaAccess] = useState(false);
  const [coaAccessMessage, setCoaAccessMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!isOwner || activeTab !== "akses-coa" || coaAccounts !== null) return;
    setIsLoadingCoaAccess(true);
    Promise.all([
      fetch("/api/coa").then((r) => r.json()),
      fetch("/api/settings/role-coa-access?role=admin").then((r) => r.json()),
    ])
      .then(([coa, access]: [CoaAccountOption[], { coaAccountIds: string[] }]) => {
        setCoaAccounts(coa);
        setSelectedCoaIds(new Set(access.coaAccountIds));
      })
      .finally(() => setIsLoadingCoaAccess(false));
  }, [isOwner, activeTab, coaAccounts]);

  const toggleCoaAccount = (id: string) => {
    setSelectedCoaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveCoaAccess = async () => {
    setIsSavingCoaAccess(true);
    setCoaAccessMessage(null);
    const res = await fetch("/api/settings/role-coa-access", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin", coaAccountIds: Array.from(selectedCoaIds) }),
    });
    setIsSavingCoaAccess(false);
    if (!res.ok) {
      setCoaAccessMessage({ type: "error", text: "Gagal menyimpan" });
      return;
    }
    setCoaAccessMessage({ type: "success", text: "Akses COA untuk role Admin tersimpan." });
  };

  return (
    <div className="space-y-6">
      <div className="p-1 rounded-2xl bg-white/90 border border-slate-200/90 shadow-2xs flex items-center gap-1 w-fit">
        {visibleTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === tab.value ? "bg-[#0544cc] text-white shadow-md shadow-blue-700/20" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "master-data" && (
        <MasterDataPanel
          domains={domains}
          recurringBills={recurringBills}
          clients={clients}
          legacySalesClients={legacySalesClients}
          items={items}
          vendors={vendors}
          cloudTypes={cloudTypes}
          hostingPackages={hostingPackages}
          servers={servers}
          maintenances={maintenances}
          cpanelAccounts={cpanelAccounts}
        />
      )}

      {activeTab === "umum" && (
      <Card variant="panel" padding="lg">
        <CardHeader>
          <CardTitle>Pembagian Uang Masuk</CardTitle>
          <CardDescription>Persentase default (bisa dioverride histori transaksi lama tetap tidak berubah).</CardDescription>
        </CardHeader>
        {settingsMessage && (
          <Alert variant={settingsMessage.type === "success" ? "success" : "error"} onClose={() => setSettingsMessage(null)}>
            {settingsMessage.text}
          </Alert>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <Input label="Operasional %" type="number" value={operasionalPct} onChange={(e) => setOperasionalPct(Number(e.target.value) || 0)} />
          <Input label="Direksi %" type="number" value={direksiPct} onChange={(e) => setDireksiPct(Number(e.target.value) || 0)} />
          <Input label="Bonus %" type="number" value={bonusPct} onChange={(e) => setBonusPct(Number(e.target.value) || 0)} />
          <Input label="PPN Default %" type="number" value={defaultPpnRate} onChange={(e) => setDefaultPpnRate(Number(e.target.value) || 0)} />
        </div>
        <p className={`text-sm font-semibold mt-3 ${Math.abs(totalPct - 100) > 0.01 ? "text-rose-600" : "text-emerald-600"}`}>
          Total split: {totalPct}%
        </p>

        <label className="flex items-center gap-2.5 mt-5 pt-5 border-t border-slate-200/60 cursor-pointer select-none">
          <input type="checkbox" checked={aiFollowUpEnabled} onChange={(e) => setAiFollowUpEnabled(e.target.checked)} className="w-5 h-5" />
          <span>
            <span className="font-bold text-sm text-slate-800 block">AI Agent Follow-up Otomatis ke Client</span>
            <span className="text-xs text-slate-500">Kalau ON, invoice yang lewat jatuh tempo diingatkan otomatis lewat WA ke nomor Client.</span>
          </span>
        </label>

        <div className="mt-5 pt-5 border-t border-slate-200/60">
          <p className="font-bold text-sm text-slate-800">Rekening Pembayaran (dicetak di Nota Invoice)</p>
          <p className="text-xs text-slate-500 mt-0.5">Rekening tujuan transfer beda tergantung invoice-nya pakai PPN atau tidak.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase">Invoice dengan PPN</p>
              <Input label="Nama Bank" value={paymentBankNamePpn} onChange={(e) => setPaymentBankNamePpn(e.target.value)} placeholder="mis. BCA" />
              <Input
                label="Atas Nama"
                value={paymentAccountNamePpn}
                onChange={(e) => setPaymentAccountNamePpn(e.target.value)}
                placeholder="mis. Seven Smarts Indonesia"
              />
              <Input
                label="No. Rekening"
                value={paymentAccountNumberPpn}
                onChange={(e) => setPaymentAccountNumberPpn(e.target.value)}
                placeholder="mis. 015 485 3711"
              />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase">Invoice tanpa PPN</p>
              <Input label="Nama Bank" value={paymentBankNameNonPpn} onChange={(e) => setPaymentBankNameNonPpn(e.target.value)} placeholder="mis. BCA" />
              <Input
                label="Atas Nama"
                value={paymentAccountNameNonPpn}
                onChange={(e) => setPaymentAccountNameNonPpn(e.target.value)}
                placeholder="mis. Seven Smarts Indonesia"
              />
              <Input
                label="No. Rekening"
                value={paymentAccountNumberNonPpn}
                onChange={(e) => setPaymentAccountNumberNonPpn(e.target.value)}
                placeholder="mis. 015 485 3711"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-200/60">
          <p className="font-bold text-sm text-slate-800">Slotting Omset</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Pembagian Laba Bersih tiap Payment (Uang Masuk - HPP) ke 4 rekening lewat Pindah Buku otomatis — lihat menu Keuangan &gt; Slotting Omset.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <Input label="Operasional %" type="number" value={slottingOperasionalPct} onChange={(e) => setSlottingOperasionalPct(Number(e.target.value) || 0)} />
            <Input label="Direksi %" type="number" value={slottingDireksiPct} onChange={(e) => setSlottingDireksiPct(Number(e.target.value) || 0)} />
            <Input label="Bonus %" type="number" value={slottingBonusPct} onChange={(e) => setSlottingBonusPct(Number(e.target.value) || 0)} />
            <Input label="Cadangan HPP %" type="number" value={slottingHppReservePct} onChange={(e) => setSlottingHppReservePct(Number(e.target.value) || 0)} />
          </div>
          <p className={`text-sm font-semibold mt-3 ${Math.abs(slottingTotalPct - 100) > 0.01 ? "text-rose-600" : "text-emerald-600"}`}>
            Total: {slottingTotalPct}%
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Select
              label="Rekening Operasional"
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              value={slottingOperasionalAccountId}
              onChange={setSlottingOperasionalAccountId}
              placeholder="Pilih akun"
            />
            <Select
              label="Rekening Direksi"
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              value={slottingDireksiAccountId}
              onChange={setSlottingDireksiAccountId}
              placeholder="Pilih akun"
            />
            <Select
              label="Rekening Bonus"
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              value={slottingBonusAccountId}
              onChange={setSlottingBonusAccountId}
              placeholder="Pilih akun"
            />
            <Select
              label="Rekening Cadangan HPP"
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              value={slottingHppReserveAccountId}
              onChange={setSlottingHppReserveAccountId}
              placeholder="Pilih akun"
            />
          </div>
          <div className="mt-4 max-w-xs">
            <Input
              label="Biaya Admin Transfer Antar Bank (Rp)"
              type="number"
              value={slottingTransferFee}
              onChange={(e) => setSlottingTransferFee(Number(e.target.value) || 0)}
            />
            <p className="text-xs text-slate-500 mt-1">Otomatis dipotong dari nominal transfer kalau rekening sumber & tujuan beda bank.</p>
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="primary" onClick={handleSaveSettings} isLoading={isSavingSettings}>
            Simpan Pengaturan
          </Button>
        </div>
      </Card>
      )}

      {activeTab === "user" && (
      <Card variant="panel" padding="lg">
        <CardHeader>
          <CardTitle>Kelola User Internal</CardTitle>
          <CardDescription>
            Owner, Direktur, Admin — semua bisa lihat data yang sama, hak akses beda per role. Nomor HP dipakai AI Agent
            mengenali chat WA dari staf.
          </CardDescription>
        </CardHeader>
        {userMessage && (
          <Alert variant={userMessage.type === "success" ? "success" : "error"} onClose={() => setUserMessage(null)}>
            {userMessage.text}
          </Alert>
        )}

        <div className="mt-4">
          <FilterableTable<UserRow>
            columns={[
              { key: "name", header: "Nama", cell: (u) => <span className="font-semibold">{u.name}</span>, filterValue: (u) => u.name },
              { key: "email", header: "Email", cell: (u) => u.email, filterValue: (u) => u.email },
              {
                key: "phone",
                header: "No. HP",
                cellClassName: "max-w-[160px]",
                cell: (u) => (
                  <Input
                    sizeVariant="sm"
                    defaultValue={u.phoneNumber ?? ""}
                    placeholder="08xxxx"
                    onBlur={(e) => {
                      if (e.target.value !== (u.phoneNumber ?? "")) handleChangePhone(u.id, e.target.value);
                    }}
                  />
                ),
              },
              {
                key: "role",
                header: "Role",
                cellClassName: "max-w-[160px]",
                filterValue: (u) => u.role,
                filterOptions: ROLE_OPTIONS,
                cell: (u) => <Select options={ROLE_OPTIONS} value={u.role} onChange={(role) => handleChangeRole(u.id, role)} searchable={false} />,
              },
              {
                key: "modules",
                header: "Modul",
                cellClassName: "min-w-[200px]",
                cell: (u) => (
                  <div className="flex flex-col gap-1.5">
                    {MODULE_OPTIONS.map((m) => (
                      <Switch
                        key={m.value}
                        label={m.label}
                        checked={u.modules.includes(m.value)}
                        disabled={!u.isActive}
                        onChange={(e) => handleToggleModule(u.id, m.value, e.target.checked)}
                      />
                    ))}
                  </div>
                ),
              },
              {
                key: "status",
                header: "Status",
                cellClassName: "min-w-[180px]",
                filterValue: (u) => (u.isActive ? "aktif" : "nonaktif"),
                filterOptions: [
                  { value: "aktif", label: "Aktif" },
                  { value: "nonaktif", label: "Nonaktif" },
                ],
                cell: (u) => {
                  if (u.id === currentUserId) {
                    return <span className="text-xs font-semibold text-slate-400">akun kamu</span>;
                  }
                  if (u.role === "owner") {
                    return <span className="text-xs font-semibold text-slate-400">Owner (selalu aktif)</span>;
                  }
                  if (pendingDeactivate === u.id) {
                    return (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-rose-700">Nonaktifkan user ini?</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="danger" onClick={() => handleToggleActive(u.id, false)}>
                            Ya, nonaktifkan
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setPendingDeactivate(null)}>
                            Batal
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <Switch
                      label={u.isActive ? "Aktif" : "Nonaktif"}
                      checked={u.isActive}
                      onChange={(e) => {
                        if (e.target.checked) handleToggleActive(u.id, true);
                        else setPendingDeactivate(u.id);
                      }}
                    />
                  );
                },
              },
            ]}
            rows={users}
            rowKey={(u) => u.id}
            rowClassName={(u) => (u.isActive ? "" : "opacity-55")}
            emptyMessage="Belum ada user."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-200/60">
          <Input label="Nama" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input label="Email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <Input label="Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <Input label="No. HP (opsional)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <Select label="Role" options={ROLE_OPTIONS} value={newRole} onChange={setNewRole} searchable={false} />
        </div>
        <div className="mt-4">
          <span className="text-xs sm:text-sm font-bold text-slate-700 block mb-2">Modul</span>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {MODULE_OPTIONS.map((m) => (
              <Switch
                key={m.value}
                label={m.label}
                checked={newModules.includes(m.value)}
                onChange={(e) =>
                  setNewModules((prev) => (e.target.checked ? [...new Set([...prev, m.value])] : prev.filter((v) => v !== m.value)))
                }
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="primary" onClick={handleCreateUser} isLoading={isSavingUser}>
            Tambah User
          </Button>
        </div>
      </Card>
      )}

      {activeTab === "akses-coa" && (
      <Card variant="panel" padding="lg">
        <CardHeader>
          <CardTitle>Akses COA per Role</CardTitle>
          <CardDescription>
            Pilih akun COA yang boleh dilihat role <strong>Admin</strong> di Akuntansi &gt; Buku Besar. Owner &amp; Direktur selalu
            bisa lihat semua akun tanpa perlu di-set di sini.
          </CardDescription>
        </CardHeader>
        {coaAccessMessage && (
          <Alert variant={coaAccessMessage.type === "success" ? "success" : "error"} onClose={() => setCoaAccessMessage(null)}>
            {coaAccessMessage.text}
          </Alert>
        )}
        {isLoadingCoaAccess || coaAccounts === null ? (
          <p className="text-sm text-slate-500 mt-4">Memuat daftar akun...</p>
        ) : (
          <>
            <p className="text-xs font-semibold text-slate-500 mt-4">{selectedCoaIds.size} akun dipilih dari {coaAccounts.length} total.</p>
            <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-2xl border border-slate-200/80 divide-y divide-slate-100">
              {coaAccounts.map((coa) => (
                <label key={coa.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none hover:bg-slate-50/80">
                  <input
                    type="checkbox"
                    className="w-4 h-4 flex-shrink-0"
                    checked={selectedCoaIds.has(coa.id)}
                    onChange={() => toggleCoaAccount(coa.id)}
                  />
                  <span className="text-xs font-mono text-slate-400 w-16 flex-shrink-0">{coa.code}</span>
                  <span className="text-sm font-semibold text-slate-800">{coa.name}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase ml-auto">{coa.type}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <Button variant="primary" onClick={handleSaveCoaAccess} isLoading={isSavingCoaAccess}>
                Simpan Akses COA
              </Button>
            </div>
          </>
        )}
      </Card>
      )}

      {activeTab === "backup" && (
      <Card variant="panel" padding="lg">
        <CardHeader>
          <CardTitle>Backup Database</CardTitle>
          <CardDescription>
            Dump data (schema simple_system) otomatis tiap hari jam 20:00 WIB ke Google Drive. Bisa juga dijalankan manual
            kapan saja lewat tombol di bawah.
          </CardDescription>
        </CardHeader>
        {backupMessage && (
          <Alert variant={backupMessage.type === "success" ? "success" : "error"} onClose={() => setBackupMessage(null)}>
            {backupMessage.text}
          </Alert>
        )}
        <div className="flex justify-end mt-4">
          <Button variant="primary" onClick={handleRunBackup} isLoading={isBackingUp}>
            Proses Backup Sekarang
          </Button>
        </div>
      </Card>
      )}
    </div>
  );
};
