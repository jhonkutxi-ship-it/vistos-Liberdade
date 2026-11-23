/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { 
  Search, 
  Send, 
  Paperclip, 
  MoreVertical, 
  User, 
  CheckCheck,
  Phone,
  Video,
  Info,
  Circle
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

export function Messages() {
  const [activeChat, setActiveChat] = useState(1);
  const [message, setMessage] = useState('');

  const chats = [
    { id: 1, name: 'Suporte Vistos Liberdade', lastMsg: 'Recebemos seus documentos...', time: '09:15', unread: 1, online: true },
    { id: 2, name: 'Consultor Ricardo', lastMsg: 'O agendamento foi confirmado.', time: 'Ontem', unread: 0, online: false },
    { id: 3, name: 'Financeiro', lastMsg: 'Fatura #1234 enviada.', time: 'Segunda', unread: 0, online: true },
  ];

  const messages = [
    { id: 1, sender: 'them', text: 'Olá! Como podemos ajudar hoje?', time: '09:00' },
    { id: 2, sender: 'me', text: 'Bom dia, gostaria de saber o status do meu visto de estudante.', time: '09:05' },
    { id: 3, sender: 'them', text: 'Claro! Vou verificar agora mesmo no sistema.', time: '09:06' },
    { id: 4, sender: 'them', text: 'Recebemos seus documentos. Vamos analisar e retornamos em breve.', time: '09:15' },
  ];

  return (
    <div className="h-[calc(100vh-120px)] flex gap-6 animate-in fade-in duration-500">
      <Card className="w-80 flex flex-col shadow-sm border-gray-100 overflow-hidden">
        <CardHeader className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <CardTitle className="text-xl font-bold">Conversas</CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Buscar conversas..." className="pl-9 h-9 bg-gray-50 border-none" />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0">
          <div className="divide-y divide-gray-50">
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setActiveChat(chat.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-4 transition-colors text-left group",
                  activeChat === chat.id ? "bg-blue-50/50" : "hover:bg-gray-50"
                )}
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                    <User className="w-6 h-6 text-blue-600" />
                  </div>
                  {chat.online && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="text-sm font-bold text-gray-900 truncate">{chat.name}</h4>
                    <span className="text-[10px] text-gray-400 font-medium">{chat.time}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-gray-500 truncate pr-2">{chat.lastMsg}</p>
                    {chat.unread > 0 && (
                      <span className="w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                        {chat.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col shadow-sm border-gray-100 overflow-hidden">
        <CardHeader className="p-4 border-b border-gray-100 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900">{chats.find(c => c.id === activeChat)?.name}</h4>
              <div className="flex items-center gap-1.5">
                <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Online</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-blue-600">
              <Phone className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-blue-600">
              <Video className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-blue-600">
              <Info className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-6 bg-gray-50/50 space-y-6">
          <div className="flex justify-center">
            <span className="px-3 py-1 bg-white rounded-full text-[10px] font-bold text-gray-400 uppercase tracking-widest shadow-sm border border-gray-100">Hoje</span>
          </div>
          {messages.map((msg) => (
            <div key={msg.id} className={cn(
              "flex flex-col max-w-[70%]",
              msg.sender === 'me' ? "ml-auto items-end" : "items-start"
            )}>
              <div className={cn(
                "p-4 rounded-2xl shadow-sm text-sm leading-relaxed",
                msg.sender === 'me' 
                  ? "bg-blue-600 text-white rounded-tr-none" 
                  : "bg-white text-gray-800 rounded-tl-none border border-gray-100"
              )}>
                {msg.text}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 px-1">
                <span className="text-[10px] text-gray-400 font-medium">{msg.time}</span>
                {msg.sender === 'me' && <CheckCheck className="w-3 h-3 text-blue-500" />}
              </div>
            </div>
          ))}
        </CardContent>
        <div className="p-4 border-t border-gray-100 bg-white">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-10 w-10 text-gray-400 hover:text-blue-600">
              <Paperclip className="w-5 h-5" />
            </Button>
            <div className="flex-1 relative">
              <Input 
                placeholder="Escreva sua mensagem..." 
                className="pr-12 h-11 bg-gray-50 border-none focus-visible:ring-blue-500"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && setMessage('')}
              />
              <Button 
                size="icon" 
                className={cn(
                  "absolute right-1 top-1 h-9 w-9 transition-all duration-300",
                  message ? "bg-blue-600 scale-100" : "bg-gray-200 scale-90 opacity-50"
                )}
                disabled={!message}
                onClick={() => setMessage('')}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
