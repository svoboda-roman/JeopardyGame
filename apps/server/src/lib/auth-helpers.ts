import { auth } from "../auth.ts";

export class HttpError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
	) {
		super(message);
	}
}

export async function requireUser(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		throw new HttpError(401, "unauthenticated", "Not signed in");
	}
	return session.user;
}

export function notFound(message = "Not found"): never {
	throw new HttpError(404, "not_found", message);
}

export function validationError(message: string): never {
	throw new HttpError(422, "validation_error", message);
}
