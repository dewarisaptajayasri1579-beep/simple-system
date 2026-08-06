"use client";

import React from "react";
import { Button } from "@/components/ui";
import { Printer } from "lucide-react";

export const PrintButton: React.FC = () => (
  <Button variant="outline" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
    Cetak Invoice
  </Button>
);
