// Logger utility with structured logging
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: any;
  userAgent?: string;
}

class Logger {
  private isDev = typeof window !== 'undefined' && !process.env.NODE_ENV?.includes('production');
  private logBuffer: LogEntry[] = [];
  private maxLogs = 100;

  private formatLog(level: LogLevel, module: string, message: string, data?: any): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data: this.sanitizeData(data),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };
  }

  private sanitizeData(data: any): any {
    if (!data) return undefined;
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'apiKey', 'privateKey', 'secret', 'authorization'];
    if (typeof data === 'object' && !Array.isArray(data)) {
      const sanitized = { ...data };
      sensitiveFields.forEach(field => {
        if (field in sanitized) {
          sanitized[field] = '[REDACTED]';
        }
      });
      return sanitized;
    }
    return data;
  }

  private log(level: LogLevel, module: string, message: string, data?: any) {
    const entry = this.formatLog(level, module, message, data);
    this.logBuffer.push(entry);

    // Keep only recent logs
    if (this.logBuffer.length > this.maxLogs) {
      this.logBuffer.shift();
    }

    // Console output in development
    if (this.isDev) {
      const style = {
        debug: 'color: #666',
        info: 'color: #0066cc',
        warn: 'color: #ff9900',
        error: 'color: #cc0000',
      };
      console.log(
        `%c[${module}] ${message}`,
        style[level],
        data ? data : ''
      );
    }
  }

  debug(module: string, message: string, data?: any) {
    this.log('debug', module, message, data);
  }

  info(module: string, message: string, data?: any) {
    this.log('info', module, message, data);
  }

  warn(module: string, message: string, data?: any) {
    this.log('warn', module, message, data);
  }

  error(module: string, message: string, data?: any) {
    this.log('error', module, message, data);
  }

  getLogs(): LogEntry[] {
    return [...this.logBuffer];
  }

  clearLogs() {
    this.logBuffer = [];
  }

  downloadLogs() {
    const logs = JSON.stringify(this.logBuffer, null, 2);
    const blob = new Blob([logs], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.json`;
    a.click();
  }
}

export const logger = new Logger();
