// Shared app-wide types

export type User = {
	id: string;
	email: string | null;
	name: string | null;
};

export type Session = {
	id: string;
	userId: string;
	expiresAt: Date;
	fresh: boolean;
};

export type SessionResult = {
	user: User | null;
	session: Session | null;
	setCookie: string | null;
};

export type CreateSessionResult = {
	user: User;
	session: Session;
	setCookie: string;
};

export type DestroySessionResult = {
	setCookie: string;
};
