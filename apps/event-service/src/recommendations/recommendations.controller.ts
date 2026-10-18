import { Controller, Get, Param, Query } from "@nestjs/common";
import { RecommendationsService } from "./recommendations.service";

@Controller("events")
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  /** Public: "Có thể bạn cũng thích" for an event page. */
  @Get(":id/recommendations")
  forEvent(@Param("id") id: string, @Query("limit") limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 8, 1), 24);
    return this.recommendations.forEvent(id, n);
  }
}
