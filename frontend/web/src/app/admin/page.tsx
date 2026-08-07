"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { adminApi } from "@/lib/api/admin";
import type { Organization } from "@/lib/types/identity";

export default function AdminPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      loadOrganizations();
    }
  }, [user]);

  const loadOrganizations = async () => {
    setOrgLoading(true);
    try {
      const orgs = await adminApi.organizations.list();
      setOrganizations(orgs);
      if (orgs.length > 0 && !activeOrgId) {
        setActiveOrgId(orgs[0].id);
      }
    } catch {
      setOrganizations([]);
    } finally {
      setOrgLoading(false);
    }
  };

  if (loading || orgLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-fp-bg">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fp-blue to-fp-cyan animate-pulse" />
      </div>
    );
  }

  return (
    <AdminDashboard
      organizations={organizations}
      activeOrgId={activeOrgId}
      onSwitchOrg={setActiveOrgId}
      onBack={() => router.push("/dashboard")}
    />
  );
}
