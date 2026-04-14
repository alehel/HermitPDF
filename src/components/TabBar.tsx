"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TabBarProps {
  activeTab: "documents" | "preview";
  onTabChange: (tab: "documents" | "preview") => void;
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const t = useTranslations("workspace");

  return (
    <div className="shrink-0 border-b border-border bg-card">
      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as "documents" | "preview")}>
        <TabsList className="w-full rounded-none bg-transparent p-0">
          <TabsTrigger
            value="documents"
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none"
          >
            {t("documentsTab")}
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none"
          >
            {t("previewTab")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
