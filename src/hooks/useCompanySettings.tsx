/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { CompanySettings, RolePermissionsConfig } from '@/src/types';
import { DEFAULT_COMPANY_SETTINGS, DEFAULT_ROLE_PERMISSIONS } from '@/src/constants';

interface CompanySettingsContextType {
  company: CompanySettings;
  rolePermissions: RolePermissionsConfig;
  loadingSettings: boolean;
  updateCompanySettings: (next: Partial<CompanySettings>) => Promise<void>;
  updateRolePermissions: (next: Partial<RolePermissionsConfig>) => Promise<void>;
}

const CompanySettingsContext = createContext<CompanySettingsContextType | undefined>(undefined);

export function CompanySettingsProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsConfig>(DEFAULT_ROLE_PERMISSIONS);
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    const companyRef = doc(db, 'settings', 'company');
    const unsubCompany = onSnapshot(
      companyRef,
      (snap) => {
        if (snap.exists()) {
          setCompany({ ...DEFAULT_COMPANY_SETTINGS, ...(snap.data() as Partial<CompanySettings>) });
        } else {
          setCompany(DEFAULT_COMPANY_SETTINGS);
        }
        setLoadingSettings(false);
      },
      () => {
        // Fallback silently to defaults if unauthenticated or offline
        setLoadingSettings(false);
      }
    );

    const permRef = doc(db, 'settings', 'permissions');
    const unsubPerms = onSnapshot(
      permRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<RolePermissionsConfig>;
          setRolePermissions({
            employee: data.employee || DEFAULT_ROLE_PERMISSIONS.employee,
            client: data.client || DEFAULT_ROLE_PERMISSIONS.client,
          });
        } else {
          setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
        }
      },
      () => {
        // Keep defaults
      }
    );

    return () => {
      unsubCompany();
      unsubPerms();
    };
  }, []);

  const updateCompanySettings = async (next: Partial<CompanySettings>) => {
    const companyRef = doc(db, 'settings', 'company');
    const merged: CompanySettings = {
      ...company,
      ...next,
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(companyRef, { ...merged, updatedAt: serverTimestamp() }, { merge: true });
      setCompany(merged);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/company');
    }
  };

  const updateRolePermissions = async (next: Partial<RolePermissionsConfig>) => {
    const permRef = doc(db, 'settings', 'permissions');
    const merged: RolePermissionsConfig = {
      ...rolePermissions,
      ...next,
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(permRef, { ...merged, updatedAt: serverTimestamp() }, { merge: true });
      setRolePermissions(merged);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/permissions');
    }
  };

  return (
    <CompanySettingsContext.Provider
      value={{
        company,
        rolePermissions,
        loadingSettings,
        updateCompanySettings,
        updateRolePermissions,
      }}
    >
      {children}
    </CompanySettingsContext.Provider>
  );
}

export function useCompanySettings() {
  const ctx = useContext(CompanySettingsContext);
  if (!ctx) {
    throw new Error('useCompanySettings must be used within a CompanySettingsProvider');
  }
  return ctx;
}
