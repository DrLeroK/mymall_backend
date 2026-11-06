import { prisma } from "../config/db";
import { AlertType, Role, StaffRole } from "@prisma/client";
import { notifyStore, notifySuperAdmin, notifyUser } from "../sockets/socket";

export class NotificationService {
  static async createAlert(params: {
    targetType: "STORE" | "ADMIN" | "CUSTOMER";
    storeId?: number;
    userId?: number;
    productId?: number;
    type: AlertType;
    title: string;
    message: string;
  }) {
    const alert = await prisma.alert.create({
      data: {
        targetType: params.targetType,
        storeId: params.storeId || null,
        userId: params.userId || null,
        productId: params.productId || null,
        type: params.type,
        title: params.title,
        message: params.message,
        isRead: false,
        isSeen: false,
      },
    });

    // STRICT AUDIENCE ISOLATION VIA SOCKET.IO
    if (params.targetType === "ADMIN") {
      notifySuperAdmin("alert:new", alert);
    } else if (params.targetType === "STORE" && params.storeId) {
      notifyStore(params.storeId, "alert:new", alert);
    } else if (params.targetType === "CUSTOMER" && params.userId) {
      notifyUser(params.userId, "alert:new", alert);
    }

    return alert;
  }

  static async getUnseenPopups(user: { id: number; role: Role; storeId?: number | null; staffRole?: StaffRole | null }) {
    let whereClause: any = { isSeen: false };

    if (user.role === Role.SUPER_ADMIN) {
      whereClause.targetType = "ADMIN";
    } else if (user.role === Role.CUSTOMER) {
      whereClause.targetType = "CUSTOMER";
      whereClause.userId = user.id;
    } else if (user.role === Role.STORE_OWNER || user.role === Role.STORE_STAFF) {
      if (!user.storeId) {
        return [];
      }
      whereClause.targetType = "STORE";
      whereClause.storeId = user.storeId;

      // STRICT ROLE PRIVACY: If the user is an ACCOUNTANT, do not show online purchase order popups
      if (user.role === Role.STORE_STAFF && user.staffRole === StaffRole.ACCOUNTANT) {
        whereClause.type = { not: AlertType.NEW_ORDER };
      }
    } else {
      return [];
    }

    const unseenAlerts = await prisma.alert.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (unseenAlerts.length > 0) {
      const ids = unseenAlerts.map((a) => a.id);
      await prisma.alert.updateMany({
        where: { id: { in: ids } },
        data: { isSeen: true },
      });
    }

    return unseenAlerts;
  }

  static async getAlerts(
    user: { id: number; role: Role; storeId?: number | null; staffRole?: StaffRole | null },
    page = 1,
    limit = 30,
    unreadOnly = false
  ) {
    let whereClause: any = {};
    if (unreadOnly) {
      whereClause.isRead = false;
    }

    if (user.role === Role.SUPER_ADMIN) {
      whereClause.targetType = "ADMIN";
    } else if (user.role === Role.CUSTOMER) {
      whereClause.targetType = "CUSTOMER";
      whereClause.userId = user.id;
    } else if (user.role === Role.STORE_OWNER || user.role === Role.STORE_STAFF) {
      if (!user.storeId) {
        return { alerts: [], unreadCount: 0, total: 0 };
      }
      whereClause.targetType = "STORE";
      whereClause.storeId = user.storeId;

      // STRICT ROLE PRIVACY: If the user is an ACCOUNTANT, do not show online purchase order alerts
      if (user.role === Role.STORE_STAFF && user.staffRole === StaffRole.ACCOUNTANT) {
        whereClause.type = { not: AlertType.NEW_ORDER };
      }
    }

    const [alerts, unreadCount, total] = await Promise.all([
      prisma.alert.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.alert.count({
        where: { ...whereClause, isRead: false },
      }),
      prisma.alert.count({
        where: whereClause,
      }),
    ]);

    return { alerts, unreadCount, total };
  }

  static async markAsRead(alertId: number, user: { id: number; role: Role; storeId?: number | null }) {
    const alert = await prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert) {
      throw new Error("Alert not found");
    }

    // Permission check
    if (user.role !== Role.SUPER_ADMIN) {
      if (alert.targetType === "STORE" && alert.storeId !== user.storeId) {
        throw new Error("Unauthorized to access this alert");
      }
      if (alert.targetType === "CUSTOMER" && alert.userId !== user.id) {
        throw new Error("Unauthorized to access this alert");
      }
    }

    return prisma.alert.update({
      where: { id: alertId },
      data: { isRead: true, isSeen: true },
    });
  }

  static async markAllAsRead(user: { id: number; role: Role; storeId?: number | null }) {
    let whereClause: any = { isRead: false };

    if (user.role === Role.SUPER_ADMIN) {
      whereClause.targetType = "ADMIN";
    } else if (user.role === Role.CUSTOMER) {
      whereClause.targetType = "CUSTOMER";
      whereClause.userId = user.id;
    } else if (user.role === Role.STORE_OWNER || user.role === Role.STORE_STAFF) {
      if (!user.storeId) return { count: 0 };
      whereClause.targetType = "STORE";
      whereClause.storeId = user.storeId;
    }

    const res = await prisma.alert.updateMany({
      where: whereClause,
      data: { isRead: true, isSeen: true },
    });

    return res;
  }

  static async markAllAsSeen(user: { id: number; role: Role; storeId?: number | null }) {
    let whereClause: any = { isSeen: false };

    if (user.role === Role.SUPER_ADMIN) {
      whereClause.targetType = "ADMIN";
    } else if (user.role === Role.CUSTOMER) {
      whereClause.targetType = "CUSTOMER";
      whereClause.userId = user.id;
    } else if (user.role === Role.STORE_OWNER || user.role === Role.STORE_STAFF) {
      if (!user.storeId) return { count: 0 };
      whereClause.targetType = "STORE";
      whereClause.storeId = user.storeId;
    }

    const res = await prisma.alert.updateMany({
      where: whereClause,
      data: { isSeen: true },
    });

    return res;
  }
}
