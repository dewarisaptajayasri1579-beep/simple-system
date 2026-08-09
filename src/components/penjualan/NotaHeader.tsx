import Image from "next/image";
import { MapPin, Phone, Mail } from "lucide-react";

const COMPANY = {
  addressLine1: "Kp. Bhayangkara RT 04/15, Siswodipuran",
  addressLine2: "Boyolali, Jawa Tengah",
  phone: "087739255404",
  email: "7smarts.id@gmail.com",
};

/** Header nota/invoice cetak — logo 7Smarts + banner gelap info perusahaan, persis format nota
 *  lama (lihat nota/Format Nota.png). Dipakai di halaman cetak invoice, nanti juga kwitansi. */
export const NotaHeader: React.FC = () => (
  <div className="flex items-start justify-between flex-wrap gap-4 print-exact-color">
    <div>
      <Image src="/nota/logo-7smarts.png" alt="7Smarts" width={140} height={47} className="h-9 w-auto" priority />
      <p className="text-3xl font-black text-slate-300 tracking-tight -mt-1">Invoice</p>
    </div>

    <div className="relative overflow-hidden rounded-2xl bg-slate-900 text-white px-6 py-4">
      <div className="absolute -top-8 -right-10 w-44 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rotate-[-10deg]" />
      <div className="relative flex flex-wrap gap-x-8 gap-y-2 text-xs sm:text-[13px]">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
          <div className="leading-snug">
            <div>{COMPANY.addressLine1}</div>
            <div>{COMPANY.addressLine2}</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Phone className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
          <div className="leading-snug">
            <div>{COMPANY.phone}</div>
            <div className="flex items-center gap-1.5">
              <Mail className="w-3 h-3" />
              {COMPANY.email}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
