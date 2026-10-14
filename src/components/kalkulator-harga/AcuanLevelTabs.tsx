"use client"

import React from "react"
import { AcuanLevelPanel, type AcuanLevelRow } from "@/components/kalkulator-harga/AcuanLevelPanel"
import { HargaBlesscomPanel, type HargaBlesscomRow } from "@/components/kalkulator-harga/HargaBlesscomPanel"
import { RubrikBobotPanel } from "@/components/kalkulator-harga/RubrikBobotPanel"
import { SimulasiPanel, type SimulasiRow } from "@/components/kalkulator-harga/SimulasiPanel"
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "@/components/ui"

export function AcuanLevelTabs({
  items,
  blesscomRows,
  simulations,
  canEdit,
}: {
  items: AcuanLevelRow[]
  blesscomRows: HargaBlesscomRow[]
  simulations: SimulasiRow[]
  canEdit: boolean
}) {
  return (
    <Tabs defaultValue="rubrik">
      <TabList>
        <Tab value="rubrik">Rubrik Bobot</Tab>
        <Tab value="contoh">Contoh per Kategori</Tab>
        <Tab value="blesscom">Level Harga Blesscom</Tab>
        <Tab value="simulasi">Simulasi Kalkulator</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="rubrik">
          <RubrikBobotPanel />
        </TabPanel>
        <TabPanel value="contoh">
          <AcuanLevelPanel items={items} canEdit={canEdit} />
        </TabPanel>
        <TabPanel value="blesscom">
          <HargaBlesscomPanel rows={blesscomRows} canEdit={canEdit} />
        </TabPanel>
        <TabPanel value="simulasi">
          <SimulasiPanel rows={simulations} />
        </TabPanel>
      </TabPanels>
    </Tabs>
  )
}
