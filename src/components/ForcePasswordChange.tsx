/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useCompanySettings } from '@/src/hooks/useCompanySettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { KeyRound, Lock, Eye, EyeOff, ShieldCheck, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';

export function ForcePasswordChange() {
  const { profile, completeFirstLoginPasswordChange, logout } = useAuth();
  const { company } = useCompanySettings();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('A palavra-passe deve ter no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('As palavras-passe não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await completeFirstLoginPasswordChange(newPassword);
    } catch (err: any) {
      setError(err?.message || 'Erro ao atualizar palavra-passe. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border border-gray-200 shadow-xl bg-white rounded-2xl overflow-hidden">
        <div className="h-1.5 bg-teal w-full" />
        <CardHeader className="p-8 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-teal-light text-teal flex items-center justify-center">
              <KeyRound className="w-6 h-6" />
            </div>
            <button
              type="button"
              onClick={logout}
              className="text-xs font-semibold text-gray-500 hover:text-red-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </button>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-teal">{company.name}</p>
            <CardTitle className="text-2xl font-bold text-gray-900 mt-1">Primeiro Acesso · Definir Palavra-passe</CardTitle>
            <CardDescription className="text-sm text-gray-500 mt-1">
              Olá, <span className="font-semibold text-gray-800">{profile?.displayName || profile?.email}</span>. Por segurança, altere a palavra-passe provisória antes de entrar no sistema.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-8 pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Nova Palavra-passe</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <Input
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 bg-gray-50 border-gray-200 rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Confirmar Nova Palavra-passe</label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <Input
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="Repita a nova palavra-passe"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 h-11 bg-gray-50 border-gray-200 rounded-xl"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-teal hover:bg-teal-dark text-white font-bold rounded-xl gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {loading ? 'A guardar...' : 'Guardar Nova Palavra-passe e Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
