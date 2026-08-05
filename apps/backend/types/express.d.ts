import "express";
import "express-serve-static-core";

declare module "express" {
    interface Request {
        userId?: string;
    }
}

declare module "express-serve-static-core" {
    interface Request {
        userId?: string;
    }
}
