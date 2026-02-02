import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { AdminRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
  companyId: string | null;
}

export interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
    companyId: string | null;
    company?: {
      id: string;
      name: string;
      slug: string;
    } | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const admin = await this.prisma.admin.findUnique({
      where: { email },
      include: {
        company: {
          select: { id: true, name: true, slug: true }
        }
      }
    });

    if (!admin) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!admin.active) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Actualizar último login
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() }
    });

    const { password: _, ...result } = admin;
    return result;
  }

  async login(user: any): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        company: user.company,
      },
    };
  }

  async register(data: {
    email: string;
    password: string;
    name: string;
    role?: AdminRole;
    companyId?: string;
  }): Promise<AuthResponse> {
    // Verificar si el email ya existe
    const existingAdmin = await this.prisma.admin.findUnique({
      where: { email: data.email }
    });

    if (existingAdmin) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Crear el admin
    const admin = await this.prisma.admin.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: data.role || AdminRole.COMPANY_ADMIN,
        companyId: data.companyId || null,
      },
      include: {
        company: {
          select: { id: true, name: true, slug: true }
        }
      }
    });

    return this.login(admin);
  }

  async getProfile(userId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: userId },
      include: {
        company: {
          select: { 
            id: true, 
            name: true, 
            slug: true,
            type: true,
            logo: true,
            active: true,
          }
        }
      }
    });

    if (!admin) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const { password: _, refreshToken: __, ...result } = admin;
    return result;
  }

  async updateProfile(userId: string, data: { name?: string; email?: string }) {
    const admin = await this.prisma.admin.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        company: {
          select: { id: true, name: true, slug: true }
        }
      }
    });

    return admin;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: userId }
    });

    if (!admin) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Contraseña actual incorrecta');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.admin.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  // Para crear el primer super admin
  async createSuperAdmin(email: string, password: string, name: string) {
    const existingAdmin = await this.prisma.admin.findFirst({
      where: { role: AdminRole.SUPER_ADMIN }
    });

    if (existingAdmin) {
      throw new ConflictException('Ya existe un super administrador');
    }

    return this.register({
      email,
      password,
      name,
      role: AdminRole.SUPER_ADMIN,
    });
  }

  // Listar admins (solo para super admin)
  async findAllAdmins(currentUserRole: AdminRole, currentUserCompanyId: string | null) {
    const where: any = {};

    // Si no es super admin, solo puede ver admins de su empresa
    if (currentUserRole !== AdminRole.SUPER_ADMIN && currentUserCompanyId) {
      where.companyId = currentUserCompanyId;
    }

    return this.prisma.admin.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        companyId: true,
        lastLoginAt: true,
        createdAt: true,
        company: {
          select: { id: true, name: true, slug: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}
