import z from "zod"

export const CreateOrderSchema = z.object({
    marketID:z.string(),
    side: z.enum(["yes", "no"]),
    type: z.enum(["buy", "sell"]),
    price: z.int().min(1).max(100),
    qty: z.int().positive()
})

export type Orderbook = {[key: string]:{
    availableQty:number,
    orders:
        {userID: string,
        qty: number,
        filledQty:number,
        originalOrderID:string,
        reverseOrder: boolean
        }[]
}}

export const SplitSchema = z.object({
    marketID: z.string(),
    amount: z.int().positive(),

})

export const MergeSchema = z.object({
    marketID: z.string(),
    amount: z.int().positive(),
})

export const CancelOrderSchema = z.object({
    marketID: z.string(),
    orderID: z.string(),
})

export const OnRampSchema = z.object({
    amount: z.int().positive(),
})

export const OffRampSchema = z.object({
    amount: z.int().positive(),
})

export class HttpError extends Error {
    statusCode: number
    constructor(statusCode: number, message: string){
        super(message)
        this.name = "HttpError"
        this.statusCode = statusCode
    }
}