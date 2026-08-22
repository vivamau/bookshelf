const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_ARCHIVE_COUNT = 5;
const SENSITIVE_KEY = /password|passphrase|token|authorization|cookie|secret|api[-_]?key|credential/i;
const LOGGER_STATE = Symbol.for('bookshelf.applicationLogger.state');

const resolveLogFile = (configuredPath) => {
    const value = String(configuredPath || 'logs/application.log').trim();
    return path.isAbsolute(value) ? value : path.resolve(__dirname, '..', value);
};

const serializeError = (error) => {
    if (!error) return undefined;
    if (!(error instanceof Error)) return { message: String(error) };

    return {
        name: error.name,
        message: error.message,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        stack: error.stack,
        ...(error.cause ? { cause: serializeError(error.cause) } : {})
    };
};

const redactSensitiveData = (value, depth = 0, seen = new WeakSet()) => {
    if (value instanceof Error) return serializeError(value);
    if (value === null || value === undefined) return value;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string') return value.slice(0, 4000);
    if (typeof value !== 'object') return value;
    if (depth >= 6) return '[TRUNCATED]';
    if (seen.has(value)) return '[CIRCULAR]';

    seen.add(value);
    if (Array.isArray(value)) {
        return value.slice(0, 100).map((item) => redactSensitiveData(item, depth + 1, seen));
    }

    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSensitiveData(item, depth + 1, seen)
    ]));
};

const messageFromArguments = (args) => args
    .filter((argument) => typeof argument === 'string' || typeof argument === 'number')
    .map(String)
    .join(' ')
    .slice(0, 4000) || 'Application error';

const getDailyLogRange = (
    date,
    timezoneOffsetMinutes = 0,
    endTimezoneOffsetMinutes = timezoneOffsetMinutes
) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
    const offset = Number(timezoneOffsetMinutes);
    const endOffset = Number(endTimezoneOffsetMinutes);
    if (
        !match
        || !Number.isInteger(offset)
        || offset < -840
        || offset > 840
        || !Number.isInteger(endOffset)
        || endOffset < -840
        || endOffset > 840
    ) {
        throw new TypeError('A valid date and timezone offset are required');
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const calendarDate = new Date(Date.UTC(year, month - 1, day));
    if (
        calendarDate.getUTCFullYear() !== year
        || calendarDate.getUTCMonth() !== month - 1
        || calendarDate.getUTCDate() !== day
    ) {
        throw new TypeError('A valid date and timezone offset are required');
    }

    return {
        start: Date.UTC(year, month - 1, day) + (offset * 60 * 1000),
        end: Date.UTC(year, month - 1, day + 1) + (endOffset * 60 * 1000)
    };
};

const createDailyLogExport = async ({
    logFile,
    date,
    timezoneOffsetMinutes = 0,
    endTimezoneOffsetMinutes = timezoneOffsetMinutes,
    archiveCount = DEFAULT_ARCHIVE_COUNT
}) => {
    const resolvedLogFile = resolveLogFile(logFile);
    const { start, end } = getDailyLogRange(
        date,
        timezoneOffsetMinutes,
        endTimezoneOffsetMinutes
    );
    const entries = await readLogRecords({
        logFile: resolvedLogFile,
        startTimestamp: start,
        endTimestamp: end,
        archiveCount
    });

    entries.sort((left, right) => left.timestamp - right.timestamp || left.sequence - right.sequence);
    return {
        content: entries.length ? `${entries.map((entry) => entry.line).join('\n')}\n` : '',
        entryCount: entries.length
    };
};

const readLogRecords = async ({
    logFile,
    startTimestamp,
    endTimestamp,
    archiveCount = DEFAULT_ARCHIVE_COUNT
}) => {
    const resolvedLogFile = resolveLogFile(logFile);
    const archiveFiles = Array.from(
        { length: Math.max(0, Number(archiveCount) || 0) },
        (_, index) => `${resolvedLogFile}.${archiveCount - index}`
    );
    const entries = [];
    let sequence = 0;

    for (const filePath of [...archiveFiles, resolvedLogFile]) {
        let contents;
        try {
            contents = await fs.promises.readFile(filePath, 'utf8');
        } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
        const lines = contents.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                const timestamp = Date.parse(entry.timestamp);
                if (
                    Number.isFinite(timestamp)
                    && timestamp >= startTimestamp
                    && timestamp < endTimestamp
                ) {
                    entries.push({ entry, line, timestamp, sequence });
                    sequence += 1;
                }
            } catch {
                // Ignore incomplete or malformed lines instead of breaking the export.
            }
        }
    }

    return entries;
};

const getApplicationLogEntries = async ({
    logFile,
    startTimestamp,
    endTimestamp,
    archiveCount = DEFAULT_ARCHIVE_COUNT,
    limit = 500
}) => {
    const start = Number(startTimestamp);
    const end = Number(endTimestamp);
    const normalizedLimit = Number(limit);
    if (
        !Number.isFinite(start)
        || !Number.isFinite(end)
        || start >= end
        || end - start > 48 * 60 * 60 * 1000
        || !Number.isInteger(normalizedLimit)
        || normalizedLimit < 1
        || normalizedLimit > 1000
    ) {
        throw new TypeError('A valid log time range and limit are required');
    }

    const records = await readLogRecords({
        logFile,
        startTimestamp: start,
        endTimestamp: end,
        archiveCount
    });
    records.sort((left, right) => right.timestamp - left.timestamp || right.sequence - left.sequence);

    return {
        entries: records.slice(0, normalizedLimit).map((record) => record.entry),
        total: records.length,
        truncated: records.length > normalizedLimit
    };
};

class ApplicationLogger {
    constructor({
        logFile = process.env.APPLICATION_LOG_FILE,
        maxBytes = Number(process.env.APPLICATION_LOG_MAX_BYTES) || DEFAULT_MAX_BYTES,
        archiveCount = DEFAULT_ARCHIVE_COUNT,
        enabled = process.env.NODE_ENV !== 'test',
        mirrorConsole = true
    } = {}) {
        this.logFile = resolveLogFile(logFile);
        this.maxBytes = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES;
        this.archiveCount = archiveCount;
        this.enabled = enabled;
        this.mirrorConsole = mirrorConsole;
        this.originalConsoleError = console.error.bind(console);
        this.originalConsoleWarn = console.warn.bind(console);
    }

    rotateIfNeeded(nextEntryBytes) {
        let currentBytes = 0;
        try {
            currentBytes = fs.statSync(this.logFile).size;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        if (currentBytes + nextEntryBytes <= this.maxBytes) return;

        for (let index = this.archiveCount; index >= 1; index -= 1) {
            const source = index === 1 ? this.logFile : `${this.logFile}.${index - 1}`;
            const destination = `${this.logFile}.${index}`;
            try {
                if (index === this.archiveCount && fs.existsSync(destination)) fs.unlinkSync(destination);
                if (fs.existsSync(source)) fs.renameSync(source, destination);
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
        }
    }

    write(level, event, message, details = {}) {
        if (!this.enabled) return;

        const entry = {
            timestamp: new Date().toISOString(),
            level,
            event,
            pid: process.pid,
            message: String(message || event).slice(0, 4000),
            ...redactSensitiveData(details)
        };
        const line = `${JSON.stringify(entry)}\n`;

        try {
            fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
            this.rotateIfNeeded(Buffer.byteLength(line));
            fs.appendFileSync(this.logFile, line, { encoding: 'utf8', mode: 0o600 });
        } catch (error) {
            this.originalConsoleError('Application logger could not write to disk:', error);
        }
    }

    error(event, error, context = {}) {
        const normalizedError = error instanceof Error ? error : new Error(String(error || event));
        this.write('ERROR', event, normalizedError.message, {
            error: serializeError(normalizedError),
            context
        });
        if (this.enabled && this.mirrorConsole) {
            this.originalConsoleError(`[${event}]`, normalizedError, context);
        }
    }

    warn(event, message, context = {}) {
        this.write('WARN', event, message, { context });
        if (this.enabled && this.mirrorConsole) {
            this.originalConsoleWarn(`[${event}] ${message}`, context);
        }
    }

    captureConsole(level, args) {
        const error = args.find((argument) => argument instanceof Error);
        this.write(level, `console.${level.toLowerCase()}`, messageFromArguments(args), {
            ...(error ? { error: serializeError(error) } : {}),
            arguments: args.map((argument) => {
                if (typeof argument === 'string') return argument.slice(0, 4000);
                return redactSensitiveData(argument);
            })
        });
    }
}

const applicationLogger = new ApplicationLogger();

const initializeApplicationLogging = () => {
    if (!applicationLogger.enabled || globalThis[LOGGER_STATE]) return applicationLogger.logFile;

    globalThis[LOGGER_STATE] = true;
    console.error = (...args) => {
        applicationLogger.originalConsoleError(...args);
        applicationLogger.captureConsole('ERROR', args);
    };
    console.warn = (...args) => {
        applicationLogger.originalConsoleWarn(...args);
        applicationLogger.captureConsole('WARN', args);
    };

    process.on('uncaughtExceptionMonitor', (error, origin) => {
        applicationLogger.error('process.uncaught_exception', error, { origin });
    });
    process.on('unhandledRejection', (reason) => {
        applicationLogger.error('process.unhandled_rejection', reason);
        const error = reason instanceof Error ? reason : new Error(String(reason));
        setImmediate(() => { throw error; });
    });

    applicationLogger.write('INFO', 'application.logging_started', 'Application error logging initialized', {
        logFile: applicationLogger.logFile,
        maxBytes: applicationLogger.maxBytes,
        archiveCount: applicationLogger.archiveCount
    });
    return applicationLogger.logFile;
};

const getRequestContext = (req) => ({
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    query: redactSensitiveData(req.query || {}),
    ip: req.ip,
    userId: req.user?.user_id,
    username: req.user?.username,
    userAgent: req.get?.('user-agent')
});

const extractResponseError = (body) => {
    if (typeof body === 'string') return body.slice(0, 2000);
    if (!body || typeof body !== 'object') return undefined;
    const message = body.error || body.message;
    return typeof message === 'string' ? message.slice(0, 2000) : undefined;
};

const createRequestErrorLogger = (logger = applicationLogger) => (req, res, next) => {
    const suppliedId = req.get('x-request-id');
    req.requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedId || '')
        ? suppliedId
        : crypto.randomUUID();
    res.setHeader('X-Request-ID', req.requestId);

    const startedAt = Date.now();
    let responseError;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    res.json = (body) => {
        responseError = responseError || extractResponseError(body);
        return originalJson(body);
    };
    res.send = (body) => {
        responseError = responseError || extractResponseError(body);
        return originalSend(body);
    };

    res.once('finish', () => {
        if (res.statusCode < 400) return;
        const context = {
            ...getRequestContext(req),
            status: res.statusCode,
            durationMs: Date.now() - startedAt,
            responseError
        };
        const message = `${req.method} ${req.path} returned ${res.statusCode}`;
        if (res.statusCode >= 500) logger.error('http.server_error', new Error(message), context);
        else logger.warn('http.client_error', message, context);
    });
    next();
};

module.exports = {
    ApplicationLogger,
    applicationLogger,
    createDailyLogExport,
    createRequestErrorLogger,
    getApplicationLogEntries,
    getDailyLogRange,
    getRequestContext,
    initializeApplicationLogging,
    redactSensitiveData,
    resolveLogFile,
    serializeError
};
