import { ApiError } from '../../../../utils/ApiError.js';
import { User } from '../../user/models/User.js';
import { verifyAccessToken } from '../../services/tokenService.js';
import { resolveUnifiedDriverIdentity } from '../../services/driverIdentityBridge.js';

export const getIdentityFromSocket = (socket) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    throw new ApiError(401, 'Socket token is required');
  }

  const payload = verifyAccessToken(token);

  // Azanto has one customer login: the food auth issues { userId, role: 'USER' }
  // for the same `users` account the taxi tokens carry as { sub, role: 'user' }.
  // Rooms and handlers key on role === 'user' and auth.sub, so normalise the
  // customer token here (the REST middleware already accepts it).
  if (String(payload?.role || '').toLowerCase() === 'user') {
    return { ...payload, role: 'user', sub: payload.sub || payload.userId || payload.id };
  }
  return payload;
};

export const attachSocketAuth = (io) => {
  io.use(async (socket, next) => {
    try {
      socket.auth = getIdentityFromSocket(socket);
      // Resolved here, not in the connection handler: an await there delays handler
      // registration, and socket.io drops events (a reconnecting driver's ride:join)
      // that arrive before their handler exists.
      socket.auth = await resolveUnifiedDriverIdentity(socket.auth);

      if (String(socket.auth.role || '').toLowerCase() === 'user') {
        const user = await User.findById(socket.auth.sub || socket.auth.id || socket.auth._id || socket.auth.userId).select('active isActive deletedAt').lean();

        if (!user || user.deletedAt || user.isActive === false || user.active === false) {
          throw new ApiError(401, 'User account is not active');
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  });
};
