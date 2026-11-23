/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  PlaneTakeoff,
  ShieldCheck,
  Lock,
  User,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Globe,
  Building2,
  KeyRound,
  Mail,
} from 'lucide-react';
import { cn } from '../lib/utils';

export function Login() {
  const { signIn, loginWithOperator, resetPasswordByEmail } = useAuth();
  const { company } = useCompanySettings();
  const [activeTab, setActiveTab] = useState<'operator' | 'client'>('operator');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Recuperação de senha via email
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleOperatorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await loginWithOperator(username, password);
    } catch (err: any) {
      console.error(err);
      if (err?.message === 'ACCOUNT_SUSPENDED') {
        setError('Esta conta encontra-se suspensa. Contacte o administrador da agência.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Palavra-passe incorreta para o utilizador especificado.');
      } else if (err.code === 'auth/user-not-found') {
        setError('Utilizador não registado. Verifique o e-mail ou o identificador de acesso.');
      } else {
        setError('Não foi possível autenticar. Verifique as suas credenciais de acesso.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(null);
    setResetSending(true);

    try {
      const sentTo = await resetPasswordByEmail(resetEmail);
      setResetSuccess(
        `Enviámos um e-mail com instruções para redefinir a sua palavra-passe para ${sentTo}. Verifique também a pasta de spam.`
      );
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        setResetError('Não encontrámos nenhuma conta registada com esse e-mail.');
      } else if (err?.code === 'auth/invalid-email') {
        setResetError('O endereço de e-mail introduzido não é válido.');
      } else if (err?.code === 'auth/too-many-requests') {
        setResetError('Demasiadas tentativas recentes. Aguarde alguns minutos antes de tentar novamente.');
      } else {
        setResetError(err?.message || 'Não foi possível enviar o e-mail de recuperação.');
      }
    } finally {
      setResetSending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-stretch bg-[#042825] font-sans selection:bg-teal selection:text-white relative overflow-hidden">
      {/* Vídeo de Fundo Global */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      >
        <source src="/assets/aistudio/7010424-uhd_3840_2160_25fps_7db0e444.mp4" type="video/mp4" />
      </video>

      {/* Scrim de Contraste sutil sobre o Vídeo */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#042825]/20 via-[#042825]/15 to-[#042825]/85 pointer-events-none" />

      {/* Lado Esquerdo sobre o Vídeo: Apenas o Rodapé */}
      <div className="hidden lg:flex flex-1 relative flex-col justify-end p-12 lg:p-16 text-white overflow-hidden">
        {/* Rodapé do Painel Institucional */}
        <div className="relative z-10 pt-5 border-t border-white/15 flex items-center justify-between gap-4 text-xs text-white/85 backdrop-blur-[2px]">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-teal-medium shrink-0" />
            <span className="font-semibold text-white">{company.name}</span>
            <span className="text-white/50">·</span>
            <span>{company.address}</span>
          </div>
          <span className="font-mono text-[10px] bg-black/30 px-2.5 py-1 rounded-md border border-white/15 text-white font-semibold shrink-0">
            NIF: {company.nif}
          </span>
        </div>
      </div>

      {/* Lado Direito: Caixa de Autenticação */}
      <div className="w-full lg:w-[520px] flex flex-col justify-between p-6 sm:p-10 md:p-14 bg-white shadow-2xl relative z-10 overflow-y-auto">
        {/* Topo Mobile / Identidade */}
        <div className="lg:hidden mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal text-white flex items-center justify-center shadow-md shadow-teal/20 overflow-hidden p-1">
            {company.logoUrl ? (
              <img src={company.logoUrl} alt={company.name} className="w-full h-full object-contain" />
            ) : (
              <PlaneTakeoff className="w-5 h-5" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 font-display leading-tight">{company.name}</h2>
            <p className="text-[10px] uppercase font-bold tracking-widest text-teal">{company.subtitle}</p>
          </div>
        </div>

        <div className="space-y-6 my-auto">
          {forgotMode ? (
            <div className="space-y-6 animate-in fade-in duration-200">
              <button
                type="button"
                onClick={() => {
                  setForgotMode(false);
                  setResetError(null);
                  setResetSuccess(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-teal hover:underline"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar ao Início de Sessão
              </button>

              <div className="space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-teal-light text-teal flex items-center justify-center">
                  <Mail className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 font-display">Recuperar Palavra-passe</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Introduza o e-mail associado à sua conta para receber uma ligação segura de redefinição da palavra-passe.
                </p>
              </div>

              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                    E-mail Registado
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="email"
                      required
                      placeholder="nome@dominio.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="pl-10 h-12 rounded-xl bg-gray-50/70 border-gray-200 focus:bg-white focus:ring-2 focus:ring-teal/30 focus:border-teal font-medium text-sm"
                    />
                  </div>
                </div>

                {resetError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                    {resetError}
                  </div>
                )}

                {resetSuccess && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                    <span>{resetSuccess}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={resetSending}
                  className="w-full h-12 bg-teal hover:bg-teal-dark text-white rounded-xl font-bold shadow-lg shadow-teal/25 gap-2 text-sm"
                >
                  {resetSending ? 'A enviar e-mail...' : 'Enviar E-mail de Recuperação'}
                </Button>
              </form>
            </div>
          ) : (
            <>
              {/* Seletor de Perfil */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Acesso à Plataforma</span>
                  <span className="text-[11px] font-semibold text-teal inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Sessão Protegida
                  </span>
                </div>

                <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-2xl border border-gray-200/70">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('operator');
                      setError(null);
                    }}
                    className={cn(
                      'py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2',
                      activeTab === 'operator'
                        ? 'bg-white text-teal shadow-md shadow-black/5 font-extrabold'
                        : 'text-gray-500 hover:text-gray-800'
                    )}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Operador / Balcão
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('client');
                      setError(null);
                    }}
                    className={cn(
                      'py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2',
                      activeTab === 'client'
                        ? 'bg-white text-teal shadow-md shadow-black/5 font-extrabold'
                        : 'text-gray-500 hover:text-gray-800'
                    )}
                  >
                    <User className="w-3.5 h-3.5" />
                    Viajante / Cliente
                  </button>
                </div>
              </div>

              {activeTab === 'operator' ? (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-gray-900 font-display">Entrar no Sistema</h2>
                    <p className="text-xs text-gray-500">
                      Introduza as suas credenciais corporativas para aceder ao terminal operacional.
                    </p>
                  </div>

                  {/* Formulário de Login do Operador (sem credenciais pré-preenchidas ou expostas) */}
                  <form onSubmit={handleOperatorSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                        E-mail ou Utilizador
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          type="text"
                          required
                          autoComplete="username"
                          placeholder="utilizador@vistosliberdade.com"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="pl-10 h-12 rounded-xl bg-gray-50/70 border-gray-200 focus:bg-white focus:ring-2 focus:ring-teal/30 focus:border-teal font-medium text-sm transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                          Palavra-passe
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setForgotMode(true);
                            setResetEmail(username.includes('@') ? username : '');
                            setResetError(null);
                            setResetSuccess(null);
                          }}
                          className="text-xs font-bold text-teal hover:underline"
                        >
                          Esqueci a minha senha
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10 pr-10 h-12 rounded-xl bg-gray-50/70 border-gray-200 focus:bg-white focus:ring-2 focus:ring-teal/30 focus:border-teal font-medium text-sm transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label="Mostrar ou ocultar palavra-passe"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
                        <span>{error}</span>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-12 bg-teal hover:bg-teal-dark text-white rounded-xl font-bold shadow-lg shadow-teal/25 flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.99] cursor-pointer"
                    >
                      {loading ? (
                        <span>A autenticar...</span>
                      ) : (
                        <>
                          <span>Entrar no Terminal de Gestão</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-teal-light text-teal mx-auto flex items-center justify-center">
                      <Globe className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-black text-gray-900">Área do Cliente & Passageiro</h3>
                    <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
                      Consulte pacotes e preços, escolha o seu consultor, agende consultoria e acompanhe o seu processo em tempo real.
                    </p>
                  </div>

                  <Button
                    type="button"
                    onClick={() => signIn()}
                    variant="outline"
                    className="w-full h-12 rounded-xl border-gray-200 hover:bg-gray-50 text-gray-700 font-bold gap-3 shadow-sm text-sm"
                  >
                    <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
                    Aceder com Conta Google
                  </Button>

                  <div className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/50 text-center space-y-1.5">
                    <p className="text-[11px] font-bold text-gray-700">Esqueceu a palavra-passe da sua conta por e-mail?</p>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotMode(true);
                        setResetError(null);
                        setResetSuccess(null);
                      }}
                      className="text-xs font-bold text-teal hover:underline"
                    >
                      Recuperar senha via e-mail
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé Corporativo e Informações Fiscais */}
        <div className="pt-6 mt-6 border-t border-gray-100 text-center space-y-1">
          <p className="text-[11px] font-bold text-gray-600">
            {company.name} · {company.subtitle}
          </p>
          <p className="text-[10px] text-gray-400">
            {company.address} {company.addressLine2 ? `· ${company.addressLine2}` : ''} · NIF: {company.nif}
          </p>
        </div>
      </div>
    </div>
  );
}
