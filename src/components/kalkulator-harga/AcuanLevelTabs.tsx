"use client"

import React from "react"
import { AcuanLevelPanel, type AcuanLevelRow } from "@/components/kalkulator-harga/AcuanLevelPanel"
import { RubrikBobotPanel } from "@/components/kalkulator-harga/RubrikBobotPanel"
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "@/components/ui"

export function AcuanLevelTabs({ items, canEdit }: { items: AcuanLevelRow[]; canEdit: boolean }) {
  return (
    <Tabs defaultValue="rubrik">
      <TabList>
        <Tab value="rubrik">Rubrik Bobot</Tab>
        <Tab value="contoh">Contoh per Kategori</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="rubrik">
          <RubrikBobotPanel />
        </TabPanel>
        <TabPanel value="contoh">
          <AcuanLevelPanel items={items} canEdit={canEdit} />
        </TabPanel>
      </TabPanels>
    </Tabs>
  )
}
