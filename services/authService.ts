
import { User } from "../types";

const USER_KEY = "kitchen_os_users";
const SESSION_KEY = "kitchen_os_session";

/**
 * Simple hash function for passwords (not cryptographically secure, but OK for local storage DSS).
 * In production, use bcrypt or argon2 on the backend.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

export const authService = {
  signup: (user: { name: string; email: string; password: string }): { success: boolean; message: string } => {
    if (!user.name || !user.email || !user.password) {
      return { success: false, message: "All fields are required." };
    }

    const usersStr = localStorage.getItem(USER_KEY);
    const users: (User & { hashedPassword: string })[] = usersStr ? JSON.parse(usersStr) : [];
    
    if (users.find(u => u.email === user.email)) {
      return { success: false, message: "Email already registered." };
    }

    const hashedPassword = simpleHash(user.password);
    users.push({ name: user.name, email: user.email, hashedPassword });
    localStorage.setItem(USER_KEY, JSON.stringify(users));
    return { success: true, message: "Account created successfully!" };
  },

  login: (email: string, password: string): User | null => {
    if (!email || !password) {
      return null;
    }

    const usersStr = localStorage.getItem(USER_KEY);
    const users: (User & { hashedPassword: string })[] = usersStr ? JSON.parse(usersStr) : [];
    
    const hashedPassword = simpleHash(password);
    const user = users.find(u => u.email === email && u.hashedPassword === hashedPassword);
    
    if (user) {
      const { hashedPassword, ...safeUser } = user;
      localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
      return safeUser;
    }
    return null;
  },

  logout: () => {
    localStorage.removeItem(SESSION_KEY);
  },

  getSession: (): User | null => {
    const session = localStorage.getItem(SESSION_KEY);
    return session ? JSON.parse(session) : null;
  },

  // Get user-specific data key for persistent storage per user
  getUserDataKey: (email: string): string => {
    return `kitchen_os_data_${email}`;
  }
};
