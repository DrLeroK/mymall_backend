import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

export let io: SocketIOServer | null = null;

export function initSocket(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`⚡ Client connected to Socket.io: ${socket.id}`);

    // Join Store Admin Dashboard Room
    socket.on('join:store', (storeId: number | string) => {
      const room = `store_${storeId}`;
      socket.join(room);
      socket.emit('joined', { room });
    });

    // Join Storefront Room (Public dynamic catalog page)
    socket.on('join:storefront', (slug: string) => {
      const room = `storefront_${slug}`;
      socket.join(room);
      socket.emit('joined', { room });
    });

    // Join SuperAdmin Platform Room
    socket.on('join:superadmin', () => {
      const room = 'superadmin';
      socket.join(room);
      socket.emit('joined', { room });
    });

    // Join User Room (For individual customer notifications)
    socket.on('join:user', (userId: number | string) => {
      const room = `user_${userId}`;
      socket.join(room);
      socket.emit('joined', { room });
    });

    // Join Chat Conversation Room (Admin-Store, Store-Customer, Admin-Customer, Dispute)
    socket.on('join:conversation', (conversationId: number | string) => {
      const room = `conversation_${conversationId}`;
      socket.join(room);
      socket.emit('joined', { room });
    });

    socket.on('leave:conversation', (conversationId: number | string) => {
      const room = `conversation_${conversationId}`;
      socket.leave(room);
      socket.emit('left', { room });
    });

    socket.on('disconnect', () => {
      // Disconnect cleanly
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.io has not been initialized!');
  }
  return io;
}

export function notifyStore(storeId: number, event: string, payload: any) {
  if (io) {
    io.to(`store_${storeId}`).emit(event, payload);
  }
}

export function notifyUser(userId: number, event: string, payload: any) {
  if (io) {
    io.to(`user_${userId}`).emit(event, payload);
  }
}

export function notifyStorefront(slug: string, event: string, payload: any) {
  if (io) {
    io.to(`storefront_${slug}`).emit(event, payload);
  }
}

export function notifySuperAdmin(event: string, payload: any) {
  if (io) {
    io.to('superadmin').emit(event, payload);
  }
}

export function notifyConversation(conversationId: number, event: string, payload: any) {
  if (io) {
    io.to(`conversation_${conversationId}`).emit(event, payload);
  }
}
