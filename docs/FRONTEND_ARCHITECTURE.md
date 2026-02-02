# 🎨 Arquitectura Frontend - NE Bot Platform

> Documento de arquitectura para el panel de administración y chat del sistema de reservas multi-tenant.

---

## 📋 Índice

1. [Decisión Tecnológica](#decisión-tecnológica)
2. [Arquitectura General](#arquitectura-general)
3. [Sistema de Autenticación](#sistema-de-autenticación)
4. [OAuth para Canales (WhatsApp/Messenger/Instagram)](#oauth-para-canales)
5. [Estructura del Proyecto](#estructura-del-proyecto)
6. [Vistas y Componentes](#vistas-y-componentes)
7. [Estado y Data Fetching](#estado-y-data-fetching)
8. [Temas de Chat por Canal](#temas-de-chat-por-canal)
9. [Responsive y Mobile](#responsive-y-mobile)

---

## 🤔 Decisión Tecnológica

### ¿Por qué Next.js y no Astro?

| Criterio | Next.js 14 ✅ | Astro ❌ |
|----------|--------------|----------|
| **Tipo de App** | SPA/Dashboard interactivo | Sitios estáticos/blogs |
| **Interactividad** | Alta (chat en tiempo real, formularios complejos) | Baja-Media |
| **Estado Global** | Excelente soporte | Limitado |
| **Autenticación** | NextAuth.js integrado | Requiere más config |
| **Real-time** | WebSockets nativos | Necesita workarounds |
| **SEO necesario** | No (es panel admin privado) | Sí (su fuerte) |
| **API Routes** | Incluidas (BFF pattern) | Limitadas |
| **Ecosistema React** | 100% compatible | Parcial |

### Conclusión

**Next.js es la opción correcta porque:**

1. ✅ Necesitamos **alta interactividad** (chat en tiempo real, drag & drop, formularios dinámicos)
2. ✅ Necesitamos **autenticación robusta** con múltiples providers (OAuth Meta)
3. ✅ Necesitamos **WebSockets** para actualización en tiempo real del chat
4. ✅ Es un **dashboard privado**, no necesitamos SEO
5. ✅ Podemos usar **Server Components** para cargas iniciales rápidas
6. ✅ **API Routes** nos permiten hacer un BFF (Backend for Frontend) limpio

**Astro sería mejor si:**
- Fuera un sitio de marketing/landing page
- Necesitáramos SEO agresivo
- Tuviéramos contenido mayormente estático

---

## 🏗️ Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js 14)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         APP ROUTER                                   │   │
│   │                                                                       │   │
│   │   /login ────────────────────────────────────────────────────────┐   │   │
│   │   /register                                                       │   │   │
│   │                                                                   │   │   │
│   │   /(dashboard) ─────────────────────────────────────────────────┐│   │   │
│   │   │                                                              ││   │   │
│   │   │  ┌──────────┐  ┌────────────────────────────────────────┐  ││   │   │
│   │   │  │ SIDEBAR  │  │              MAIN CONTENT               │  ││   │   │
│   │   │  │          │  │                                          │  ││   │   │
│   │   │  │ Dashboard│  │  ┌────────────────────────────────────┐ │  ││   │   │
│   │   │  │ 💬 Chats │  │  │                                    │ │  ││   │   │
│   │   │  │ 📅 Reserv│  │  │         DYNAMIC CONTENT            │ │  ││   │   │
│   │   │  │ 📦 Produc│  │  │                                    │ │  ││   │   │
│   │   │  │ 🛎️ Servic│  │  │    (Server + Client Components)   │ │  ││   │   │
│   │   │  │ 👥 Client│  │  │                                    │ │  ││   │   │
│   │   │  │ 📊 Analyt│  │  └────────────────────────────────────┘ │  ││   │   │
│   │   │  │ ⚙️ Config│  │                                          │  ││   │   │
│   │   │  └──────────┘  └────────────────────────────────────────┘  ││   │   │
│   │   │                                                              ││   │   │
│   │   └──────────────────────────────────────────────────────────────┘│   │   │
│   │                                                                   │   │   │
│   └───────────────────────────────────────────────────────────────────┘   │   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         CAPAS DE SOPORTE                             │   │
│   │                                                                       │   │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │   │
│   │   │   NextAuth  │  │   Zustand   │  │ React Query │  │  Socket.io│  │   │
│   │   │   (Auth)    │  │   (Estado)  │  │  (Fetching) │  │ (Realtime)│  │   │
│   │   └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │   │
│   │                                                                       │   │
│   └───────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         API LAYER                                    │   │
│   │                                                                       │   │
│   │   /api/auth/*        → NextAuth handlers                             │   │
│   │   /api/trpc/*        → tRPC (opcional, type-safe)                    │   │
│   │   Resto              → Llamadas directas al Backend NestJS           │   │
│   │                                                                       │   │
│   └───────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     │ HTTP/WebSocket
                                     │
┌────────────────────────────────────▼────────────────────────────────────────┐
│                              BACKEND (NestJS)                               │
│                                                                             │
│   REST API: /api/v1/*                                                       │
│   WebSocket: /socket.io                                                     │
│   Webhooks: /webhooks/whatsapp, /webhooks/messenger, /webhooks/instagram    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Sistema de Autenticación

### Flujo de Auth del Usuario Admin

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FLUJO DE AUTENTICACIÓN (NextAuth.js)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   USUARIO                    FRONTEND                      BACKEND          │
│      │                          │                             │             │
│      │  1. Ingresa email/pass   │                             │             │
│      │─────────────────────────>│                             │             │
│      │                          │                             │             │
│      │                          │  2. POST /api/auth/login    │             │
│      │                          │────────────────────────────>│             │
│      │                          │                             │             │
│      │                          │  3. Valida credenciales     │             │
│      │                          │     Genera JWT + Refresh    │             │
│      │                          │<────────────────────────────│             │
│      │                          │                             │             │
│      │  4. Guarda en session    │                             │             │
│      │     (httpOnly cookie)    │                             │             │
│      │<─────────────────────────│                             │             │
│      │                          │                             │             │
│      │  5. Redirect /dashboard  │                             │             │
│      │<─────────────────────────│                             │             │
│                                                                             │
│   ════════════════════════════════════════════════════════════════════════  │
│                                                                             │
│   EN CADA REQUEST PROTEGIDO:                                                │
│                                                                             │
│      │  Request a /dashboard/*  │                             │             │
│      │─────────────────────────>│                             │             │
│      │                          │                             │             │
│      │                          │  Middleware verifica JWT    │             │
│      │                          │  en cookie httpOnly         │             │
│      │                          │                             │             │
│      │                          │  Si válido: continúa        │             │
│      │                          │  Si expirado: refresh       │             │
│      │                          │  Si inválido: /login        │             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Providers de Auth

```typescript
// Configuración NextAuth
export const authOptions: NextAuthOptions = {
  providers: [
    // 1. Credenciales (email/password)
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        // Llama al backend NestJS
        const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
          method: 'POST',
          body: JSON.stringify(credentials),
          headers: { 'Content-Type': 'application/json' }
        });
        const user = await res.json();
        if (res.ok && user) return user;
        return null;
      }
    }),
    
    // 2. Google (opcional para admins)
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.companyAccess = user.companyAccess;
        token.accessToken = user.accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role;
      session.user.companyAccess = token.companyAccess;
      session.accessToken = token.accessToken;
      return session;
    }
  },
  
  pages: {
    signIn: '/login',
    error: '/login',
  },
  
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 horas
  }
};
```

---

## 🔗 OAuth para Canales (WhatsApp/Messenger/Instagram)

### Flujo de Conexión de Cuentas de Meta

Este es el flujo para que el **admin de una empresa** conecte sus cuentas de WhatsApp Business, Página de Facebook, o Instagram Business.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              FLUJO OAuth - CONECTAR CUENTA DE META                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ADMIN                      FRONTEND                    META + BACKEND     │
│     │                           │                              │            │
│     │  1. Click "Conectar      │                              │            │
│     │     WhatsApp Business"   │                              │            │
│     │─────────────────────────>│                              │            │
│     │                          │                              │            │
│     │                          │  2. Abre popup Meta OAuth    │            │
│     │                          │─────────────────────────────>│            │
│     │                          │                              │            │
│     │  3. Usuario autoriza     │                              │            │
│     │     permisos en Meta     │                              │            │
│     │──────────────────────────────────────────────────────────>           │
│     │                          │                              │            │
│     │                          │  4. Meta redirige con code   │            │
│     │                          │<─────────────────────────────│            │
│     │                          │                              │            │
│     │                          │  5. Envía code al backend    │            │
│     │                          │─────────────────────────────>│            │
│     │                          │                              │            │
│     │                          │  6. Backend intercambia      │            │
│     │                          │     code por access_token    │            │
│     │                          │                              │            │
│     │                          │  7. Guarda token encriptado  │            │
│     │                          │     en Channel de la empresa │            │
│     │                          │<─────────────────────────────│            │
│     │                          │                              │            │
│     │  8. Muestra "Conectado"  │                              │            │
│     │<─────────────────────────│                              │            │
│     │                          │                              │            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Permisos Requeridos por Canal

```typescript
// Permisos para cada canal de Meta

const META_PERMISSIONS = {
  whatsapp: [
    'whatsapp_business_management',  // Administrar cuenta de WhatsApp Business
    'whatsapp_business_messaging',   // Enviar y recibir mensajes
    'business_management',           // Administrar información del negocio
  ],
  
  messenger: [
    'pages_messaging',               // Enviar mensajes desde la página
    'pages_read_engagement',         // Leer interacciones
    'pages_manage_metadata',         // Administrar metadata de página
    'pages_show_list',               // Listar páginas del usuario
  ],
  
  instagram: [
    'instagram_basic',               // Información básica del perfil
    'instagram_manage_messages',     // Enviar y recibir mensajes DM
    'instagram_manage_comments',     // Gestionar comentarios
    'pages_show_list',               // Listar páginas vinculadas
  ],
};
```

### Componente de Conexión de Canales

```tsx
// Vista: /settings/channels

export default function ChannelsPage() {
  const { company } = useCompany();
  const { data: channels } = useChannels(company.id);
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Canales de Comunicación</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* WhatsApp */}
        <ChannelCard
          icon={<WhatsAppIcon />}
          name="WhatsApp Business"
          description="Conecta tu número de WhatsApp Business"
          connected={channels?.whatsapp?.active}
          phoneNumber={channels?.whatsapp?.config?.phoneNumber}
          onConnect={() => connectChannel('whatsapp')}
          onDisconnect={() => disconnectChannel('whatsapp')}
        />
        
        {/* Messenger */}
        <ChannelCard
          icon={<MessengerIcon />}
          name="Facebook Messenger"
          description="Conecta tu página de Facebook"
          connected={channels?.messenger?.active}
          pageName={channels?.messenger?.config?.pageName}
          onConnect={() => connectChannel('messenger')}
          onDisconnect={() => disconnectChannel('messenger')}
        />
        
        {/* Instagram */}
        <ChannelCard
          icon={<InstagramIcon />}
          name="Instagram Direct"
          description="Conecta tu cuenta de Instagram Business"
          connected={channels?.instagram?.active}
          username={channels?.instagram?.config?.username}
          onConnect={() => connectChannel('instagram')}
          onDisconnect={() => disconnectChannel('instagram')}
        />
      </div>
    </div>
  );
}

// Función que inicia OAuth
function connectChannel(type: 'whatsapp' | 'messenger' | 'instagram') {
  const permissions = META_PERMISSIONS[type].join(',');
  const redirectUri = `${window.location.origin}/api/auth/callback/meta`;
  const state = btoa(JSON.stringify({ type, companyId: company.id }));
  
  const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
  authUrl.searchParams.set('client_id', META_APP_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', permissions);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_type', 'code');
  
  // Abrir en popup
  window.open(authUrl.toString(), 'meta-oauth', 'width=600,height=700');
}
```

---

## 📁 Estructura del Proyecto

```
frontend/
│
├── app/                              # App Router (Next.js 14)
│   │
│   ├── (auth)/                       # Grupo de rutas de auth (sin layout dashboard)
│   │   ├── login/
│   │   │   └── page.tsx              # Página de login
│   │   ├── register/
│   │   │   └── page.tsx              # Página de registro
│   │   ├── forgot-password/
│   │   │   └── page.tsx
│   │   └── layout.tsx                # Layout minimalista para auth
│   │
│   ├── (dashboard)/                  # Grupo de rutas del dashboard
│   │   ├── layout.tsx                # Layout con Sidebar + Header
│   │   ├── page.tsx                  # Dashboard principal (métricas)
│   │   │
│   │   ├── conversations/            # 💬 MÓDULO DE CHATS
│   │   │   ├── page.tsx              # Bandeja de conversaciones
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx          # Conversación individual
│   │   │   └── layout.tsx            # Layout split (lista + chat)
│   │   │
│   │   ├── reservations/             # 📅 MÓDULO DE RESERVAS
│   │   │   ├── page.tsx              # Lista de reservas
│   │   │   ├── calendar/
│   │   │   │   └── page.tsx          # Vista calendario
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx          # Detalle de reserva
│   │   │   └── new/
│   │   │       └── page.tsx          # Crear reserva manual
│   │   │
│   │   ├── products/                 # 📦 MÓDULO DE PRODUCTOS
│   │   │   ├── page.tsx              # Lista de productos
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx          # Editar producto
│   │   │   └── new/
│   │   │       └── page.tsx          # Crear producto
│   │   │
│   │   ├── services/                 # 🛎️ MÓDULO DE SERVICIOS
│   │   │   ├── page.tsx
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   │
│   │   ├── customers/                # 👥 MÓDULO DE CLIENTES
│   │   │   ├── page.tsx              # Lista de clientes
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Perfil del cliente
│   │   │
│   │   ├── analytics/                # 📊 MÓDULO DE ANALÍTICAS
│   │   │   ├── page.tsx              # Dashboard de métricas
│   │   │   ├── conversations/
│   │   │   │   └── page.tsx          # Métricas de chat
│   │   │   └── reservations/
│   │   │       └── page.tsx          # Métricas de reservas
│   │   │
│   │   └── settings/                 # ⚙️ CONFIGURACIÓN
│   │       ├── page.tsx              # Configuración general
│   │       ├── company/
│   │       │   └── page.tsx          # Datos de la empresa
│   │       ├── channels/
│   │       │   └── page.tsx          # Conectar WA/Messenger/IG
│   │       ├── team/
│   │       │   └── page.tsx          # Gestión de equipo
│   │       ├── bot/
│   │       │   └── page.tsx          # Configuración del bot
│   │       └── billing/
│   │           └── page.tsx          # Facturación y plan
│   │
│   ├── api/                          # API Routes (BFF)
│   │   ├── auth/
│   │   │   ├── [...nextauth]/
│   │   │   │   └── route.ts          # NextAuth handler
│   │   │   └── callback/
│   │   │       └── meta/
│   │   │           └── route.ts      # Callback OAuth de Meta
│   │   └── socket/
│   │       └── route.ts              # WebSocket upgrade
│   │
│   ├── globals.css                   # Estilos globales + Tailwind
│   └── layout.tsx                    # Root layout
│
├── components/
│   │
│   ├── ui/                           # Componentes base (shadcn/ui)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   └── ... (más componentes)
│   │
│   ├── layout/                       # Componentes de layout
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── MobileNav.tsx
│   │   └── UserMenu.tsx
│   │
│   ├── chat/                         # Componentes del chat
│   │   ├── ConversationList.tsx      # Lista de conversaciones
│   │   ├── ConversationItem.tsx      # Item individual
│   │   ├── ChatWindow.tsx            # Ventana de chat
│   │   ├── MessageBubble.tsx         # Burbuja de mensaje
│   │   ├── ChatInput.tsx             # Input de mensaje
│   │   ├── ChannelBadge.tsx          # Badge WA/Messenger/IG
│   │   ├── ChannelFilter.tsx         # Filtro por canal
│   │   │
│   │   └── themes/                   # Temas visuales por canal
│   │       ├── WhatsAppTheme.tsx
│   │       ├── MessengerTheme.tsx
│   │       └── InstagramTheme.tsx
│   │
│   ├── reservations/                 # Componentes de reservas
│   │   ├── ReservationCard.tsx
│   │   ├── ReservationForm.tsx
│   │   ├── CalendarView.tsx
│   │   └── TimeSlotPicker.tsx
│   │
│   ├── products/                     # Componentes de productos
│   │   ├── ProductCard.tsx
│   │   ├── ProductForm.tsx
│   │   └── ProductTable.tsx
│   │
│   ├── analytics/                    # Componentes de analíticas
│   │   ├── StatCard.tsx
│   │   ├── Chart.tsx
│   │   └── DateRangePicker.tsx
│   │
│   └── common/                       # Componentes compartidos
│       ├── LoadingSpinner.tsx
│       ├── EmptyState.tsx
│       ├── ErrorBoundary.tsx
│       ├── ConfirmDialog.tsx
│       └── SearchInput.tsx
│
├── lib/
│   ├── api.ts                        # Cliente API (fetch wrapper)
│   ├── auth.ts                       # Configuración NextAuth
│   ├── socket.ts                     # Cliente Socket.io
│   ├── utils.ts                      # Utilidades
│   └── constants.ts                  # Constantes
│
├── hooks/
│   ├── useAuth.ts                    # Hook de autenticación
│   ├── useCompany.ts                 # Hook de empresa actual
│   ├── useConversations.ts           # Hook de conversaciones
│   ├── useReservations.ts            # Hook de reservas
│   ├── useSocket.ts                  # Hook de WebSocket
│   └── usePermissions.ts             # Hook de permisos
│
├── stores/                           # Estado global (Zustand)
│   ├── authStore.ts
│   ├── companyStore.ts
│   ├── chatStore.ts
│   └── uiStore.ts
│
├── types/
│   ├── index.ts                      # Tipos principales
│   ├── api.ts                        # Tipos de API
│   ├── auth.ts                       # Tipos de auth
│   └── chat.ts                       # Tipos de chat
│
├── public/
│   ├── whatsapp-bg.png               # Fondo de chat WhatsApp
│   ├── logo.svg
│   └── favicon.ico
│
├── .env.local                        # Variables de entorno
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 🖥️ Vistas Principales

### 1. Dashboard Principal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🏠 Dashboard                                        👤 Juan Admin  ▼       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ 💬 Chats    │ │ 📅 Reservas │ │ 💰 Ingresos │ │ 👥 Clientes │           │
│  │    24       │ │    12       │ │  $2.4M      │ │    156      │           │
│  │   activos   │ │    hoy      │ │   mes       │ │   nuevos    │           │
│  │   ↑ 12%     │ │   ↑ 5%      │ │   ↑ 18%     │ │   ↑ 8%      │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                                             │
│  ┌───────────────────────────────────┐ ┌───────────────────────────────┐   │
│  │ 📈 Conversaciones por Día         │ │ 🥧 Por Canal                   │   │
│  │                                   │ │                               │   │
│  │     ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄      │ │   WhatsApp    65%  ████████   │   │
│  │   ▄█████████████████████████▄    │ │   Messenger   25%  ████       │   │
│  │  ████████████████████████████    │ │   Instagram   10%  ██         │   │
│  │  L   M   M   J   V   S   D       │ │                               │   │
│  └───────────────────────────────────┘ └───────────────────────────────┘   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ 🕐 Actividad Reciente                                                 │ │
│  │                                                                       │ │
│  │ • Nueva reserva: Mesa para 4 - Juan Pérez          hace 2 min        │ │
│  │ • Pago confirmado: $125.000 - María García         hace 5 min        │ │
│  │ • Chat escalado a humano: Carlos López             hace 10 min       │ │
│  │ • Reserva cancelada: Limpieza dental               hace 15 min       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Vista de Conversaciones (Chat)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  💬 Conversaciones                                   👤 Juan Admin  ▼       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────┐ ┌──────────────────────────────────────────┐ │
│  │ 🔍 Buscar...             │ │                                          │ │
│  │                          │ │  ┌────────────────────────────────────┐  │ │
│  │ [Todos ▼] [WA][FB][IG]   │ │  │ 👤 Juan Pérez        📱 WhatsApp   │  │ │
│  │                          │ │  │ +57 315 123 4567    🕐 en línea    │  │ │
│  │ ┌────────────────────┐   │ │  │ [🤖 Bot] [👤 Tomar Control]        │  │ │
│  │ │ 📱 Juan Pérez      │   │ │  └────────────────────────────────────┘  │ │
│  │ │ Hola, quiero res...│   │ │                                          │ │
│  │ │ 2 min • WhatsApp   │   │ │  ┌────────────────────────────────────┐  │ │
│  │ │ 🟢                 │   │ │  │                                    │  │ │
│  │ └────────────────────┘   │ │  │  Hola! 👋 Quiero reservar          │  │ │
│  │                          │ │  │  una mesa para 4 personas          │  │ │
│  │ ┌────────────────────┐   │ │  │                          12:30 ✓✓  │  │ │
│  │ │ 💬 María García    │   │ │  └────────────────────────────────────┘  │ │
│  │ │ ¿Cuánto cuesta?    │   │ │                                          │ │
│  │ │ 5 min • Messenger  │   │ │  ┌────────────────────────────────────┐  │ │
│  │ └────────────────────┘   │ │  │ ¡Hola Juan! 😊 Con gusto te        │  │ │
│  │                          │ │  │ ayudo con tu reserva.               │  │ │
│  │ ┌────────────────────┐   │ │  │                                    │  │ │
│  │ │ 📷 Carlos López    │   │ │  │ ¿Para qué fecha te gustaría?       │  │ │
│  │ │ Me interesa el...  │   │ │  │                          12:31 ✓✓  │  │ │
│  │ │ 15 min • Instagram │   │ │  └────────────────────────────────────┘  │ │
│  │ └────────────────────┘   │ │                                          │ │
│  │                          │ │  ┌────────────────────────────────────┐  │ │
│  │         ...              │ │  │                                    │  │ │
│  │                          │ │  │  Para este sábado                  │  │ │
│  │                          │ │  │                          12:32 ✓✓  │  │ │
│  │                          │ │  └────────────────────────────────────┘  │ │
│  │                          │ │                                          │ │
│  │                          │ │  ┌────────────────────────────────────┐  │ │
│  │                          │ │  │ 📝 Escribe un mensaje...      📎 📷│  │ │
│  │                          │ │  └────────────────────────────────────┘  │ │
│  └──────────────────────────┘ └──────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Vista de Configuración de Canales

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ⚙️ Configuración > Canales                          👤 Juan Admin  ▼       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Conecta tus canales de comunicación para recibir mensajes de clientes.     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │   📱 WhatsApp Business                              [✅ Conectado]  │   │
│  │   ─────────────────────────────────────────────────────────────    │   │
│  │   Número: +57 315 123 4567                                         │   │
│  │   Nombre: Restaurante La Pasta                                     │   │
│  │   Estado: Activo ● Webhook verificado                              │   │
│  │                                                                     │   │
│  │   Mensajes hoy: 124        Tiempo respuesta: 2.3 seg               │   │
│  │                                                                     │   │
│  │   [⚙️ Configurar]  [🔄 Reconectar]  [❌ Desconectar]               │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │   💬 Facebook Messenger                             [✅ Conectado]  │   │
│  │   ─────────────────────────────────────────────────────────────    │   │
│  │   Página: Restaurante La Pasta                                     │   │
│  │   ID: 123456789012345                                              │   │
│  │   Estado: Activo ● Webhook verificado                              │   │
│  │                                                                     │   │
│  │   [⚙️ Configurar]  [🔄 Reconectar]  [❌ Desconectar]               │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │   📷 Instagram Direct                             [➕ Conectar]     │   │
│  │   ─────────────────────────────────────────────────────────────    │   │
│  │                                                                     │   │
│  │   Conecta tu cuenta de Instagram Business para recibir             │   │
│  │   mensajes directos de tus clientes.                               │   │
│  │                                                                     │   │
│  │   Requisitos:                                                       │   │
│  │   • Cuenta de Instagram Business o Creator                         │   │
│  │   • Vinculada a una página de Facebook                             │   │
│  │                                                                     │   │
│  │   [🔗 Conectar Instagram]                                           │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Temas de Chat por Canal

### Estilos CSS Variables

```css
/* globals.css */

:root {
  /* WhatsApp Theme */
  --wa-bg: #e5ddd5;
  --wa-bubble-out: #dcf8c6;
  --wa-bubble-in: #ffffff;
  --wa-header: #075e54;
  --wa-accent: #25d366;
  
  /* Messenger Theme */
  --fb-bg: #ffffff;
  --fb-bubble-out: #0084ff;
  --fb-bubble-in: #e4e6eb;
  --fb-header: #0084ff;
  --fb-text-out: #ffffff;
  
  /* Instagram Theme */
  --ig-bg: #ffffff;
  --ig-bubble-out: linear-gradient(135deg, #833AB4, #FD1D1D, #F77737);
  --ig-bubble-in: #efefef;
  --ig-header: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
}
```

### Componente de Tema

```tsx
// components/chat/themes/ChatThemeProvider.tsx

interface ChatThemeProviderProps {
  channel: 'WHATSAPP' | 'MESSENGER' | 'INSTAGRAM';
  children: React.ReactNode;
}

export function ChatThemeProvider({ channel, children }: ChatThemeProviderProps) {
  const themeClass = {
    WHATSAPP: 'theme-whatsapp',
    MESSENGER: 'theme-messenger',
    INSTAGRAM: 'theme-instagram',
  }[channel];
  
  return (
    <div className={`chat-container ${themeClass}`}>
      {children}
    </div>
  );
}

// Estilos por tema
/*
.theme-whatsapp {
  --chat-bg: url('/whatsapp-bg.png');
  --bubble-out-bg: #dcf8c6;
  --bubble-in-bg: #ffffff;
  --bubble-radius-out: 8px 0 8px 8px;
  --bubble-radius-in: 0 8px 8px 8px;
}

.theme-messenger {
  --chat-bg: #ffffff;
  --bubble-out-bg: #0084ff;
  --bubble-in-bg: #e4e6eb;
  --bubble-out-text: #ffffff;
  --bubble-radius: 18px;
}

.theme-instagram {
  --chat-bg: #ffffff;
  --bubble-out-bg: linear-gradient(135deg, #833AB4, #FD1D1D, #F77737);
  --bubble-in-bg: #efefef;
  --bubble-out-text: #ffffff;
  --bubble-radius: 22px;
}
*/
```

---

## 📱 Responsive y Mobile

### Breakpoints

```typescript
// tailwind.config.ts
export default {
  theme: {
    screens: {
      'sm': '640px',   // Mobile landscape
      'md': '768px',   // Tablet
      'lg': '1024px',  // Desktop
      'xl': '1280px',  // Large desktop
      '2xl': '1536px', // Extra large
    }
  }
}
```

### Layout Adaptativo

```
DESKTOP (lg+)                           MOBILE (< lg)
┌──────────────────────────┐            ┌──────────────────┐
│ Sidebar │    Content     │            │     Header 📱    │
│         │                │            ├──────────────────┤
│ 📊      │                │            │                  │
│ 💬      │   Page         │            │    Page          │
│ 📅      │   Content      │            │    Content       │
│ 📦      │                │            │                  │
│ ⚙️      │                │            │                  │
│         │                │            │                  │
└──────────────────────────┘            ├──────────────────┤
                                        │ [📊][💬][📅][⚙️] │
                                        └──────────────────┘
                                              Bottom Nav
```

---

## 📦 Dependencias Principales

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "next-auth": "^4.24.0",
    
    "tailwindcss": "^3.4.0",
    "@radix-ui/react-*": "latest",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.4.0",
    "socket.io-client": "^4.7.0",
    
    "date-fns": "^2.30.0",
    "zod": "^3.22.0",
    "react-hook-form": "^7.48.0",
    "@hookform/resolvers": "^3.3.0",
    
    "recharts": "^2.9.0",
    "lucide-react": "^0.292.0"
  },
  "devDependencies": {
    "typescript": "^5.2.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

---

## 🚀 Comandos de Desarrollo

```bash
# Crear proyecto
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir=false

# Instalar shadcn/ui
npx shadcn-ui@latest init

# Agregar componentes de shadcn
npx shadcn-ui@latest add button input card dialog table tabs

# Instalar dependencias adicionales
npm install next-auth @tanstack/react-query zustand socket.io-client
npm install date-fns zod react-hook-form @hookform/resolvers
npm install recharts lucide-react

# Desarrollo
npm run dev

# Build
npm run build

# Producción
npm start
```

---

## 📋 Checklist de Implementación

### Fase 1: Estructura Base
- [ ] Crear proyecto Next.js 14
- [ ] Configurar Tailwind + shadcn/ui
- [ ] Crear estructura de carpetas
- [ ] Configurar NextAuth (login básico)
- [ ] Layout Dashboard (Sidebar + Header)
- [ ] Página de Login

### Fase 2: Módulo de Chats
- [ ] Lista de conversaciones
- [ ] Vista de chat individual
- [ ] Temas por canal (WA/Messenger/IG)
- [ ] WebSocket para tiempo real
- [ ] Takeover (humano toma control)

### Fase 3: OAuth de Canales
- [ ] Flujo OAuth para WhatsApp
- [ ] Flujo OAuth para Messenger
- [ ] Flujo OAuth para Instagram
- [ ] Página de configuración de canales

### Fase 4: Módulos CRUD
- [ ] Productos (lista, crear, editar)
- [ ] Servicios (lista, crear, editar)
- [ ] Recursos (lista, crear, editar)
- [ ] Clientes (lista, perfil)

### Fase 5: Reservas y Analytics
- [ ] Lista de reservas
- [ ] Vista calendario
- [ ] Dashboard de métricas
- [ ] Gráficas con Recharts

---

> **Nota**: Este documento es una guía de arquitectura. Los detalles de implementación pueden ajustarse según las necesidades del proyecto.
