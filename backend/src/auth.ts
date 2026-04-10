import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const comparePassword = (plain: string, hash: string) =>
  bcrypt.compare(plain, hash);

export type JwtPayload = { agentId: string; email: string };

export const signToken = (payload: JwtPayload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

export const verifyToken = (token: string): JwtPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
};
