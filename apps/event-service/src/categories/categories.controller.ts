import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { RequireAuthGuard } from "../auth/require-auth.guard";
import { Role } from "../auth/role";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { LogActivity } from "../activity-log/log-activity.decorator";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  list() {
    return this.categoriesService.list();
  }

  @Post()
  @UseGuards(RequireAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @LogActivity({ action: "category.created", targetType: "category", summary: ({ result }) => `Tạo danh mục "${result.name}"` })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }
}
