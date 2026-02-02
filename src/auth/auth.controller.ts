import { 
  Controller, 
  Post, 
  Get, 
  Put,
  Body, 
  UseGuards, 
  Request,
  HttpCode,
  HttpStatus,
  Res
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AdminRole } from '@prisma/client';

class LoginDto {
  email: string;
  password: string;
}

class RegisterDto {
  email: string;
  password: string;
  name: string;
  role?: AdminRole;
  companyId?: string;
}

class ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

class UpdateProfileDto {
  name?: string;
  email?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: any) {
    // En JWT stateless, el logout se maneja en el frontend eliminando el token
    // Aquí podemos registrar el evento o invalidar tokens si implementamos blacklist
    return {
      success: true,
      message: 'Sesión cerrada correctamente',
      userId: user.sub
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN)
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(
    @CurrentUser() user: any,
    @Body() updateDto: UpdateProfileDto
  ) {
    return this.authService.updateProfile(user.sub, updateDto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('change-password')
  async changePassword(
    @CurrentUser() user: any,
    @Body() changePasswordDto: ChangePasswordDto
  ) {
    return this.authService.changePassword(
      user.sub,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Get('admins')
  async findAllAdmins(@CurrentUser() user: any) {
    return this.authService.findAllAdmins(user.role, user.companyId);
  }

  // Endpoint para crear el primer super admin (solo funciona si no existe ninguno)
  @Public()
  @Post('setup')
  async setupSuperAdmin(@Body() body: { email: string; password: string; name: string }) {
    return this.authService.createSuperAdmin(body.email, body.password, body.name);
  }

  @UseGuards(JwtAuthGuard)
  @Get('verify')
  async verifyToken(@CurrentUser() user: any) {
    return { valid: true, user };
  }
}
