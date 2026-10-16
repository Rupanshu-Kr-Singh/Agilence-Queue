import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import queueRouter from "./queue";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(queueRouter);

export default router;
