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
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  phoneNumber: string | null;
}

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "direktur", label: "Direktur" },
  { value: "admin", label: "Admin" },
];

const TABS = [
  { value: "umum", label: "Umum" },
  { value: "user", label: "User" },
  { value: "master-data", label: "Master Data" },
  { value: "backup", label: "Backup" },
] as const;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PengaturanPanel: React.FC<{
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
}> = ({
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
}) => {
  const router = useRouter();
  const [activeTab, setActiveTabState] = useState<(typeof TABS)[number]["value"]>("umum");

  useEffect(() => {
    const saved = window.localStorage.getItem("pengaturan:tab");
    if (saved && TABS.some((t) => t.value === saved)) {
      setActiveTabState(saved as (typeof TABS)[number]["value"]);
    }
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
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [users, setUsers] = useState(initialUsers);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userMessage, setUserMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const totalPct = operasionalPct + direksiPct + bonusPct;

  const handleSaveSettings = async () => {
    setSettingsMessage(null);
    if (Math.abs(totalPct - 100) > 0.01) {
      setSettingsMessage({ type: "error", text: "Total persentase split harus 100%" });
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
      body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, role: newRole, phoneNumber: newPhone }),
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

  return (
    <div className="space-y-6">
      <div className="p-1 rounded-2xl bg-white/90 border border-slate-200/90 shadow-2xs flex items-center gap-1 w-fit">
        {TABS.map((tab) => (
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
            ]}
            rows={users}
            rowKey={(u) => u.id}
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
        <div className="flex justify-end mt-4">
          <Button variant="primary" onClick={handleCreateUser} isLoading={isSavingUser}>
            Tambah User
          </Button>
        </div>
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
