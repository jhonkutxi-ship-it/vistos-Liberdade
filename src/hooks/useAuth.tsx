/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import {
  onAuthStateChanged,
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  signInWithEmailAndPassword,
  updatePassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, OperationType, handleFirestoreError } from '@/src/firebase';
import { PermissionKey, UserProfile, UserRole } from '@/src/types';
import { ROLES } from '@/src/constants';
import { useCompanySettings } from './useCompanySettings';
import { generateSalt, hashPasswordWithSalt, verifyPasswordWithSalt } from '@/src/utils/cryptoHelpers';
import firebaseConfig from '../../firebase-applet-config.json';

export interface CreateEmployeePayload {
  displayName: string;
  email: string;
  username?: string;
  initialPassword: string;
  role: 'employee' | 'admin';
  mustChangePassword: boolean;
  permissions?: PermissionKey[];
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  loginWithOperator: (username: string, pass: string) => Promise<void>;
  createEmployeeAccount: (payload: CreateEmployeePayload) => Promise<{ uid: string; email: string; authProviderCreated: boolean }>;
  completeFirstLoginPasswordChange: (newPassword: string) => Promise<void>;
  changeOwnPassword: (newPassword: string) => Promise<void>;
  resetPasswordByEmail: (emailOrUsername: string) => Promise<string>;
  logout: () => Promise<void>;
  hasPermission: (permission: PermissionKey) => boolean;
  isAdmin: boolean;
  isEmployee: boolean;
  isStaff: boolean;
  isClient: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const OPERATOR_SESSION_KEY = 'vistos_liberdade_operator_session';

function getSecondaryAuth() {
  const existing = getApps().find((a) => a.name === 'SecondaryEmployeeCreator');
  const secApp = existing || initializeApp(firebaseConfig, 'SecondaryEmployeeCreator');
  return getAuth(secApp);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { rolePermissions } = useCompanySettings();

  useEffect(() => {
    const saved = localStorage.getItem(OPERATOR_SESSION_KEY);
    if (saved && !user) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.uid) {
          setUser({
            uid: parsed.uid,
            email: parsed.email || 'manpe123@vistosliberdade.com',
            displayName: parsed.displayName || 'Manpe 123',
          } as unknown as User);
          setProfile(parsed);
          setLoading(false);
        }
      } catch {
        localStorage.removeItem(OPERATOR_SESSION_KEY);
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        const saved = localStorage.getItem(OPERATOR_SESSION_KEY);
        if (!saved) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    if (user.uid === 'manpe123-operator-session') {
      setLoading(false);
      return;
    }

    const saved = localStorage.getItem(OPERATOR_SESSION_KEY);
    let savedOverride: UserProfile | null = null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.uid === user.uid || parsed.linkedAuthUid === user.uid) {
          savedOverride = parsed;
        }
      } catch {
        // ignore
      }
    }

    const targetUid = savedOverride?.uid || user.uid;
    const userDocRef = doc(db, 'users', targetUid);

    const unsubscribe = onSnapshot(
      userDocRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const docData = snapshot.data() as UserProfile;
          const resolvedProfile = { ...docData, uid: snapshot.id };
          setProfile(resolvedProfile);
          setLoading(false);

          if (resolvedProfile.role === 'admin' || resolvedProfile.role === 'employee') {
            setDoc(
              doc(db, 'consultants', snapshot.id),
              {
                uid: snapshot.id,
                displayName: resolvedProfile.displayName || resolvedProfile.username || 'Consultor',
                role: resolvedProfile.role,
                specialty:
                  resolvedProfile.role === 'admin'
                    ? 'Direção & Consultoria'
                    : 'Consultor de Vistos & Viagens',
                active: resolvedProfile.active !== false,
              },
              { merge: true }
            ).catch(() => {});
          }
        } else {
          const userEmail = (user.email || '').toLowerCase();
          const isManpe =
            userEmail === 'manpe@vistosliberdade.com' ||
            userEmail === 'manpe123@vistosliberdade.com' ||
            userEmail.startsWith('manpe123');
          const isDefaultAdmin = userEmail === 'jhonkutxi@gmail.com' || isManpe;

          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || (isManpe ? 'manpe123@vistosliberdade.com' : ''),
            displayName: user.displayName || (isManpe ? 'Manpe 123 (Operador)' : ''),
            photoURL: user.photoURL || '',
            role: (isDefaultAdmin ? ROLES.ADMIN : ROLES.CLIENT) as UserRole,
            active: true,
            mustChangePassword: false,
            createdAt: new Date().toISOString(),
          };

          try {
            await setDoc(userDocRef, {
              ...newProfile,
              createdAt: serverTimestamp(),
            });
            setProfile(newProfile);
            setLoading(false);
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${targetUid}`);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      localStorage.removeItem(OPERATOR_SESSION_KEY);
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    try {
      localStorage.removeItem(OPERATOR_SESSION_KEY);
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      console.error('Email sign in error:', error);
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    try {
      localStorage.removeItem(OPERATOR_SESSION_KEY);
      await createUserWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      console.error('Email sign up error:', error);
      throw error;
    }
  };

  const loginWithOperator = async (usernameInput: string, passInput: string) => {
    const rawUser = usernameInput.trim().toLowerCase();
    const isManpe =
      rawUser === 'manpe123' ||
      rawUser === 'manpe' ||
      rawUser === 'man pe' ||
      rawUser === 'manpe123@vistosliberdade.com';

    const email = isManpe
      ? 'manpe123@vistosliberdade.com'
      : rawUser.includes('@')
      ? rawUser
      : `${rawUser.replace(/\s+/g, '')}@vistosliberdade.com`;

    localStorage.removeItem(OPERATOR_SESSION_KEY);

    // 1. Try direct Firebase Email/Password sign-in
    try {
      const cred = await signInWithEmailAndPassword(auth, email, passInput);
      const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
      if (userSnap.exists() && userSnap.data()?.active === false) {
        await signOut(auth);
        throw new Error('ACCOUNT_SUSPENDED');
      }
      return;
    } catch (err: any) {
      if (err?.message === 'ACCOUNT_SUSPENDED') throw err;
      console.log('Direct email sign-in note:', err?.code);

      // 2. Check invite/operator fallback credential (used when Email/Pass provider is disabled in Firebase Console or for newly created staff)
      try {
        const { signInAnonymously } = await import('firebase/auth');
        let currentUid = auth.currentUser?.uid;
        if (!currentUid) {
          const anonCred = await signInAnonymously(auth);
          currentUid = anonCred.user.uid;
        }

        const inviteSnap = await getDoc(doc(db, 'staff_invites', email));
        if (inviteSnap.exists()) {
          const invite = inviteSnap.data();
          if (invite.active === false) {
            await signOut(auth);
            throw new Error('ACCOUNT_SUSPENDED');
          }
          const valid = await verifyPasswordWithSalt(passInput, invite.passwordSalt, invite.passwordHash);
          if (!valid) {
            await signOut(auth);
            const wrongPassErr: any = new Error('Palavra-passe incorreta.');
            wrongPassErr.code = 'auth/wrong-password';
            throw wrongPassErr;
          }

          // Load target user profile and bind current auth UID if needed
          try {
            const targetUserSnap = await getDoc(doc(db, 'users', invite.uid));
            if (targetUserSnap.exists()) {
              const targetProfile = targetUserSnap.data() as UserProfile;
              if (targetProfile.active === false) {
                await signOut(auth);
                throw new Error('ACCOUNT_SUSPENDED');
              }
              const sessionProfile = { ...targetProfile, linkedAuthUid: currentUid };
              localStorage.setItem(OPERATOR_SESSION_KEY, JSON.stringify(sessionProfile));
              setProfile(targetProfile);
              return;
            }
          } catch (readErr: any) {
            if (readErr?.message === 'ACCOUNT_SUSPENDED') throw readErr;
          }

          const fallbackInviteProfile: UserProfile = {
            uid: invite.uid,
            email: invite.email,
            username: invite.username,
            displayName: invite.displayName || invite.username,
            role: invite.role || 'employee',
            active: invite.active !== false,
            mustChangePassword: Boolean(invite.mustChangePassword),
            ...(Array.isArray(invite.permissions) ? { permissions: invite.permissions } : {}),
          };
          const sessionProfile = { ...fallbackInviteProfile, linkedAuthUid: currentUid };
          localStorage.setItem(OPERATOR_SESSION_KEY, JSON.stringify(sessionProfile));
          setProfile(fallbackInviteProfile);
          return;
        }
      } catch (inviteErr: any) {
        if (inviteErr?.message === 'ACCOUNT_SUSPENDED' || inviteErr?.code === 'auth/wrong-password') {
          throw inviteErr;
        }
        console.log('Invite lookup note:', inviteErr);
      }

      // 3. Auto-signup for manpe123 if not registered yet
      if (isManpe && (passInput === 'manpe123' || passInput === 'manpe')) {
        try {
          await createUserWithEmailAndPassword(auth, email, passInput);
          return;
        } catch (createErr: any) {
          console.log('Auto signup note:', createErr?.code);
        }

        // Anonymous fallback for manpe123
        try {
          const { signInAnonymously } = await import('firebase/auth');
          const cred = await signInAnonymously(auth);
          const operatorProfile: UserProfile = {
            uid: cred.user.uid,
            email: 'manpe123@vistosliberdade.com',
            username: 'manpe123',
            displayName: 'Manpe 123 (Operador)',
            photoURL: '',
            role: ROLES.ADMIN as UserRole,
            active: true,
            mustChangePassword: false,
            createdAt: new Date().toISOString(),
          };
          try {
            await setDoc(doc(db, 'users', cred.user.uid), {
              ...operatorProfile,
              createdAt: serverTimestamp(),
            });
          } catch (docErr) {
            console.warn('Doc set warning:', docErr);
          }
          setProfile(operatorProfile);
          return;
        } catch (anonErr) {
          console.warn('Anonymous fallback warning:', anonErr);
        }

        const fallbackProfile: UserProfile = {
          uid: 'manpe123-operator-session',
          email: 'manpe123@vistosliberdade.com',
          username: 'manpe123',
          displayName: 'Manpe 123 (Operador Balcão)',
          photoURL: '',
          role: ROLES.ADMIN as UserRole,
          active: true,
          mustChangePassword: false,
          createdAt: new Date().toISOString(),
        };
        localStorage.setItem(OPERATOR_SESSION_KEY, JSON.stringify(fallbackProfile));
        setProfile(fallbackProfile);
        setUser({
          uid: 'manpe123-operator-session',
          email: 'manpe123@vistosliberdade.com',
          displayName: 'Manpe 123 (Operador Balcão)',
        } as unknown as User);
        return;
      }

      throw err;
    }
  };

  const createEmployeeAccount = async (payload: CreateEmployeePayload) => {
    const cleanEmail = payload.email.trim().toLowerCase();
    const cleanUsername = (payload.username || cleanEmail.split('@')[0]).trim().toLowerCase();
    let uid = '';
    let authProviderCreated = false;

    // 1. Create real Firebase Auth user on a secondary app instance so admin stays logged in
    try {
      const secondaryAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, payload.initialPassword);
      uid = cred.user.uid;
      authProviderCreated = true;
      await signOut(secondaryAuth);
    } catch (authErr: any) {
      console.warn('Secondary Firebase Auth creation note:', authErr?.code);
      if (authErr?.code === 'auth/email-already-in-use') {
        throw new Error('Já existe uma conta registada com este e-mail.');
      }
      // Fallback UID when Email/Pass provider is disabled in Firebase Console
      uid = 'emp_' + Math.random().toString(36).substring(2, 11);
    }

    // 2. Hash password safely for staff_invites fallback / verification
    const passwordSalt = generateSalt();
    const passwordHash = await hashPasswordWithSalt(payload.initialPassword, passwordSalt);

    const newEmployeeProfile: UserProfile = {
      uid,
      email: cleanEmail,
      username: cleanUsername,
      displayName: payload.displayName.trim(),
      role: payload.role,
      active: true,
      mustChangePassword: payload.mustChangePassword,
      ...(payload.permissions ? { permissions: payload.permissions } : {}),
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'users', uid), {
        ...newEmployeeProfile,
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'consultants', uid), {
        uid,
        displayName: payload.displayName.trim(),
        role: payload.role,
        specialty: payload.role === 'admin' ? 'Direção & Consultoria' : 'Consultor de Vistos & Viagens',
        active: true,
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'staff_invites', cleanEmail), {
        uid,
        email: cleanEmail,
        username: cleanUsername,
        displayName: payload.displayName.trim(),
        passwordSalt,
        passwordHash,
        role: payload.role,
        active: true,
        mustChangePassword: payload.mustChangePassword,
        ...(payload.permissions ? { permissions: payload.permissions } : {}),
        updatedAt: serverTimestamp(),
      });

      return { uid, email: cleanEmail, authProviderCreated };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${uid}`);
      throw error;
    }
  };

  const completeFirstLoginPasswordChange = async (newPassword: string) => {
    if (!profile) throw new Error('Utilizador não autenticado.');
    if (newPassword.length < 6) {
      throw new Error('A nova palavra-passe deve ter pelo menos 6 caracteres.');
    }

    // 1. Update Firebase Auth password if logged in via Email/Password provider
    const currentUser = auth.currentUser;
    if (currentUser && !currentUser.isAnonymous) {
      try {
        await updatePassword(currentUser, newPassword);
      } catch (err: any) {
        console.warn('Firebase updatePassword warning:', err?.code);
        if (err?.code === 'auth/requires-recent-login') {
          throw new Error('Por segurança, saia e volte a entrar com a passe provisória antes de alterar.');
        }
      }
    }

    // 2. Update staff_invites hash & clear mustChangePassword flag in Firestore
    const cleanEmail = profile.email.toLowerCase();
    const passwordSalt = generateSalt();
    const passwordHash = await hashPasswordWithSalt(newPassword, passwordSalt);

    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        mustChangePassword: false,
        updatedAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, 'staff_invites', cleanEmail),
        {
          uid: profile.uid,
          email: cleanEmail,
          passwordSalt,
          passwordHash,
          mustChangePassword: false,
          active: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setProfile({ ...profile, mustChangePassword: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
    }
  };

  const changeOwnPassword = async (newPassword: string) => {
    await completeFirstLoginPasswordChange(newPassword);
  };

  const resetPasswordByEmail = async (emailOrUsername: string): Promise<string> => {
    const clean = emailOrUsername.trim().toLowerCase();
    if (!clean) {
      throw new Error('Por favor, introduza o seu e-mail ou nome de utilizador.');
    }
    const isManpeAlias = clean === 'manpe123' || clean === 'manpe';
    const targetEmail = isManpeAlias
      ? 'manpe123@vistosliberdade.com'
      : clean.includes('@')
      ? clean
      : `${clean.replace(/\s+/g, '')}@vistosliberdade.com`;

    await sendPasswordResetEmail(auth, targetEmail);
    return targetEmail;
  };

  const logout = async () => {
    try {
      localStorage.removeItem(OPERATOR_SESSION_KEY);
      await signOut(auth);
      setUser(null);
      setProfile(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const hasPermission = (permission: PermissionKey): boolean => {
    if (!profile) return false;
    if (profile.active === false) return false;
    if (profile.role === ROLES.ADMIN) return true;
    if (Array.isArray(profile.permissions)) {
      return profile.permissions.includes(permission);
    }
    if (profile.role === ROLES.EMPLOYEE) {
      return rolePermissions.employee.includes(permission);
    }
    return rolePermissions.client.includes(permission);
  };

  const value: AuthContextType = {
    user,
    profile,
    loading,
    signIn,
    signInWithEmail,
    signUpWithEmail,
    loginWithOperator,
    createEmployeeAccount,
    completeFirstLoginPasswordChange,
    changeOwnPassword,
    resetPasswordByEmail,
    logout,
    hasPermission,
    isAdmin: profile?.role === ROLES.ADMIN,
    isEmployee: profile?.role === ROLES.EMPLOYEE || profile?.role === ROLES.ADMIN,
    isStaff: profile?.role === ROLES.EMPLOYEE || profile?.role === ROLES.ADMIN,
    isClient: profile?.role === ROLES.CLIENT,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
