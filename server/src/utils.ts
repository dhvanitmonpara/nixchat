// Utility functions for chat server

export function sanitizeString(input: string, maxLength: number = 255): string {
    if (typeof input !== "string") {
        throw new Error("Input must be a string");
    }
    
    return input
        .trim()
        .slice(0, maxLength)
        .replace(/[<>]/g, ""); // Basic XSS prevention
}

export function validateRoomName(roomName: string): boolean {
    if (typeof roomName !== "string") return false;
    
    const sanitized = sanitizeString(roomName, 50);
    
    // Room name should be alphanumeric with hyphens and underscores
    const roomNameRegex = /^[a-zA-Z0-9_-]+$/;
    
    return sanitized.length >= 1 && 
           sanitized.length <= 50 && 
           roomNameRegex.test(sanitized);
}

export function validateUsername(username: string): boolean {
    if (typeof username !== "string") return false;
    
    const sanitized = sanitizeString(username, 30);
    
    // Username should be alphanumeric with spaces, hyphens and underscores
    const usernameRegex = /^[a-zA-Z0-9 _-]+$/;
    
    return sanitized.length >= 1 && 
           sanitized.length <= 30 && 
           usernameRegex.test(sanitized);
}

export function validateMessage(message: string): boolean {
    if (typeof message !== "string") return false;
    
    const sanitized = sanitizeString(message, 1000);
    
    return sanitized.length >= 1 && sanitized.length <= 1000;
}

// Simple rate limiting
export class RateLimiter {
    private requests: Map<string, number[]> = new Map();
    private maxRequests: number;
    private windowMs: number;

    constructor(maxRequests: number = 10, windowMs: number = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    isAllowed(identifier: string): boolean {
        const now = Date.now();
        const requests = this.requests.get(identifier) || [];
        
        // Remove old requests outside the window
        const validRequests = requests.filter(time => now - time < this.windowMs);
        
        if (validRequests.length >= this.maxRequests) {
            return false;
        }
        
        validRequests.push(now);
        this.requests.set(identifier, validRequests);
        
        return true;
    }

    cleanup(): void {
        const now = Date.now();
        for (const [identifier, requests] of this.requests.entries()) {
            const validRequests = requests.filter(time => now - time < this.windowMs);
            if (validRequests.length === 0) {
                this.requests.delete(identifier);
            } else {
                this.requests.set(identifier, validRequests);
            }
        }
    }
}