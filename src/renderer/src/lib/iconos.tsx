/**
 * Los iconos por nombre, para lo que llega guardado como texto: el icono de
 * cada categoría y el de cada caja fuerte. Se importan uno a uno, que Lucide
 * trae miles y el paquete solo tiene que llevarse estos.
 */
import {
  AppWindow,
  Asterisk,
  BadgeCheck,
  Bitcoin,
  BookUser,
  Braces,
  Briefcase,
  CarFront,
  Code,
  ContactRound,
  CreditCard,
  Database,
  FileLock,
  Fish,
  Gamepad2,
  Heart,
  House,
  IdCard,
  KeyRound,
  Landmark,
  Mail,
  NotebookPen,
  Plane,
  Server,
  ShieldPlus,
  Star,
  Stethoscope,
  Terminal,
  User,
  Users,
  Vault,
  Wifi,
  type LucideIcon,
  type LucideProps
} from 'lucide-react'
import type { ReactNode } from 'react'

const MAPA: Record<string, LucideIcon> = {
  'key-round': KeyRound,
  asterisk: Asterisk,
  'notebook-pen': NotebookPen,
  'credit-card': CreditCard,
  'contact-round': ContactRound,
  'id-card': IdCard,
  'book-user': BookUser,
  'car-front': CarFront,
  'shield-plus': ShieldPlus,
  landmark: Landmark,
  bitcoin: Bitcoin,
  'file-lock': FileLock,
  wifi: Wifi,
  'app-window': AppWindow,
  mail: Mail,
  server: Server,
  database: Database,
  braces: Braces,
  terminal: Terminal,
  'badge-check': BadgeCheck,
  stethoscope: Stethoscope,
  fish: Fish,
  vault: Vault,
  house: House,
  briefcase: Briefcase,
  user: User,
  users: Users,
  plane: Plane,
  heart: Heart,
  star: Star,
  code: Code,
  'gamepad-2': Gamepad2
}

export function Icono({ nombre, ...props }: { nombre: string } & LucideProps): ReactNode {
  const Dibujo = MAPA[nombre] ?? KeyRound
  return <Dibujo strokeWidth={1.8} {...props} />
}
