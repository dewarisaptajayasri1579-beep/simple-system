"use client";

import React from "react";
import Link from "next/link";
import { Card, CardTitle, CardDescription } from "@/components/ui";
import { ArrowUpRight, ArrowDownLeft, Wallet, Tags, ArrowLeftRight, PieChart, History } from "lucide-react";

/** Halaman induk Keuangan — tiap kartu navigasi ke halaman riwayat + tambah entri sendiri,
 *  bukan modal di tempat, supaya histori pembayaran per kategori langsung kelihatan. Bayar
 *  Domain/Server tidak lagi menu terpisah — jadi salah satu Tipe baris di Kas Keluar. */
export const KeuanganPanel: React.FC = () => {
  const menuCards = [
    {
      key: "kas-keluar",
      icon: <ArrowUpRight className="w-6 h-6" />,
      title: "Kas Keluar",
      description: "Catat pengeluaran kas/bank — termasuk Bayar Domain/Server",
      href: "/keuangan/kas-keluar",
      accent: "text-rose-600 bg-rose-50",
    },
    {
      key: "kas-masuk",
      icon: <ArrowDownLeft className="w-6 h-6" />,
      title: "Kas Masuk",
      description: "Catat pemasukan kas/bank manual",
      href: "/keuangan/kas-masuk",
      accent: "text-emerald-600 bg-emerald-50",
    },
    {
      key: "histori-uang-masuk",
      icon: <History className="w-6 h-6" />,
      title: "Histori Uang Masuk",
      description: "Uang masuk dari penjualan (pelunasan invoice) + rekap per minggu",
      href: "/keuangan/histori-uang-masuk",
      accent: "text-emerald-600 bg-emerald-50",
    },
    {
      key: "akun-kas-bank",
      icon: <Wallet className="w-6 h-6" />,
      title: "Akun Kas dan Bank",
      description: "Kelola daftar akun kas/bank & saldo",
      href: "/keuangan/akun-kas-bank",
      accent: "text-sky-600 bg-sky-50",
    },
    {
      key: "akun-biaya",
      icon: <Tags className="w-6 h-6" />,
      title: "Akun Biaya",
      description: "Kelola kategori Pendapatan, Biaya, HPP & mapping COA",
      href: "/keuangan/akun-biaya",
      accent: "text-amber-600 bg-amber-50",
    },
    {
      key: "pindah-buku",
      icon: <ArrowLeftRight className="w-6 h-6" />,
      title: "Pindah Buku",
      description: "Pindahkan saldo antar akun kas/bank sendiri",
      href: "/keuangan/pindah-buku",
      accent: "text-violet-600 bg-violet-50",
    },
    {
      key: "slotting-omset",
      icon: <PieChart className="w-6 h-6" />,
      title: "Slotting Omset",
      description: "Bagi Laba Bersih tiap pembayaran ke Operasional/Direksi/Bonus/Cadangan HPP",
      href: "/keuangan/slotting-omset",
      accent: "text-indigo-600 bg-indigo-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {menuCards.map((card) => (
          <Link key={card.key} href={card.href}>
            <Card variant="feature" padding="md" className="h-full hover:-translate-y-0.5 transition-transform cursor-pointer">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${card.accent}`}>{card.icon}</div>
              <CardTitle className="mt-3 text-base">{card.title}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
};
