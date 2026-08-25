"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Alert } from "../ui";
import { Mail, Lock } from "lucide-react";

export const LoginForm: React.FC<{ showTopLockIcon?: boolean; className?: string }> = ({
  showTopLockIcon = true,
  className = "",
}) => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Silakan masukkan email");
      return;
    }
    if (!password.trim()) {
      setError("Silakan masukkan password");
      return;
    }

    setError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Email atau password salah");
        setIsLoading(false);
        return;
      }
      router.push("/modules");
      router.refresh();
    } catch {
      setError("Gagal menghubungi server, coba lagi");
      setIsLoading(false);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {showTopLockIcon && (
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-[#f0f5ff] text-[#0544cc] border border-blue-100 flex items-center justify-center shadow-sm">
            <Lock className="w-7 h-7 stroke-[2.2]" />
          </div>
        </div>
      )}

      <h2 className="text-center font-bold text-[#1e293b] text-lg sm:text-xl mb-6 tracking-tight">
        Masuk untuk melanjutkan
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="w-5 h-5 text-slate-600" />}
        />

        <Input
          placeholder="Password"
          isPassword
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock className="w-5 h-5 text-slate-600" />}
        />

        <div className="pt-2">
          <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isLoading} loadingText="Memproses...">
            Login
          </Button>
        </div>
      </form>
    </div>
  );
};
