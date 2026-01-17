export class DateHelper {
  private static readonly TIMEZONE = 'America/Bogota';


  static getNow(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: this.TIMEZONE }));
  }


  static getTodayString(): string {
    const now = this.getNow();
    return this.formatDateToISO(now);
  }


  static getTomorrowString(): string {
    const now = this.getNow();
    now.setDate(now.getDate() + 1);
    return this.formatDateToISO(now);
  }

  static formatDateToISO(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  static formatDateReadable(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    const dayName = days[date.getDay()];
    const monthName = months[date.getMonth()];

    const today = this.getTodayString();
    const tomorrow = this.getTomorrowString();

    if (dateStr === today) {
      return `hoy ${dayName} ${day} de ${monthName}`;
    } else if (dateStr === tomorrow) {
      return `mañana ${dayName} ${day} de ${monthName}`;
    }

    return `${dayName} ${day} de ${monthName}`;
  }

  static formatTimeReadable(timeStr: string): string {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  static getCurrentTime(): string {
    const now = this.getNow();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  static isToday(dateStr: string): boolean {
    return dateStr === this.getTodayString();
  }


  static isTomorrow(dateStr: string): boolean {
    return dateStr === this.getTomorrowString();
  }


  static isPast(dateStr: string): boolean {
    return dateStr < this.getTodayString();
  }
}
