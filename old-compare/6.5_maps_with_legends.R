### create maps of enacted and proposed maps

library(tidyverse)
library(sf)
library(tmap)
library(edbuildr)

####################
### INPUTS - change these to process new map

map_filepath <- "geo/output/cooper_congress/cooper_congress_4326.geojson"

out_filepath <- "assessment/cooper_congress/maps/with_legend/"
dtype = "cooper_congress"

##### Choose the correct one
enacted <- st_read("geo/current/enacted_congress22_40pct.geojson") |>
  mutate(bvap_r = round2(pct_bvp, 3),
         mvap_r = round2(pct_bp_, 3),
         avap_r = round2(pct_avp, 3),
         hvap_r = round2(pct_hvp, 3))

# enacted <- st_read("geo/current/enacted_senate22_40pct.geojson") |> 
#   mutate(bvap_r = round2(pct_bvp, 3),
#          mvap_r = round2(pct_bp_, 3),
#          avap_r = round2(pct_avp, 3),
#          hvap_r = round2(pct_hvp, 3))

# enacted <- st_read("geo/current/enacted_house22_40pct.geojson") |> 
#   mutate(bvap_r = round2(pct_bvp, 3),
#          mvap_r = round2(pct_bp_, 3),
#          avap_r = round2(pct_avp, 3),
#          hvap_r = round2(pct_hvp, 3))

####################
### END INPUTS

### import remedy map
remedy_map <- st_read(map_filepath) |>
  mutate(bvap_r = round2(pct_bvap_ap, 3),
         mvap_r = round2(pct_mvap, 3),
         avap_r = round2(pct_avap_ap, 3),
         hvap_r = round2(pct_hvap, 3)) 

# bvap_colors <- c('#e7e1ef', '#d4b9da', '#8c6bb1', '#88419d')
# mvap_colors <- c('#feebe2', '#fbb4b9', '#f768a1', '#ae017e')
# avap_colors <- c('#edf8e9', '#bae4b3', '#74c476', '#238b45')
# hvap_colors <- c('#ffffd4', '#fed98e', '#fe9929', '#cc4c02')
bvap_colors <- c('#ecdcf0', '#d1acdc', '#b77bc9', '#9c56b0', '#733785')
mvap_colors <- c('#feebe2', '#fbb4b9', '#ff8a9d', '#f768a1', '#ae017e')
avap_colors <- c('#edf8e9', '#bae4b3', '#92d194', '#74c476', '#238b45')
hvap_colors <- c('#ffffd4', '#fed98e', '#fcc047', '#fe9929', '#cc4c02')
partisan_colors <- c('#bc131e', '#eb4956', '#c36e9e', '#7279db', '#3c6ebf', '#1f4bae')

remedy_map_data <- st_drop_geometry(remedy_map)

#### Filter and create map of enacted bvap map ####
bvap_enacted <- enacted |>
  filter(bvap_r >= .5)

e_map <- tm_shape(enacted) +
  tm_polygons("bvap_r", breaks=c(0, .25, .37, .5, .75, 1), # change the variable to what you're mapping
              palette = bvap_colors, border.col = "#aeaeae", title = "Black Voting-Age Pop") +
  tm_shape(bvap_enacted) +
  tm_borders(lwd=2, col = "#000000", alpha = 1) +
  tm_layout(legend.format= list(fun=function(x) paste0(formatC(x*100, digits=0, format="f"), " %")),
            frame = FALSE) + 
  tm_add_legend('fill',
                col = "transparent",
                lwd = 2,
                border.col = "#000000",
                labels = "Black-Majority District")

#### Filter and create map of proposed bvap map ####
bvap_proposed <- remedy_map |>
  filter(bvap_r >= .5)

bvap_proposed_influence <- remedy_map |>
  filter(bvap_r >= .37 & bvap_r < .5)

p_map <- tm_shape(remedy_map) +
  tm_polygons("bvap_r", breaks=c(0, .25, .37, .5, .75, 1), # change the variable to what you're mapping
              palette = bvap_colors, border.col = "#aeaeae", title = "Black Voting-Age Pop") +
  tm_shape(bvap_proposed) +
  tm_borders(lwd=2, col = "#000000", alpha = 1) +
  tm_layout(legend.format= list(fun=function(x) paste0(formatC(x*100, digits=0, format="f"), " %")),
            frame = FALSE) + 
  tm_add_legend('fill',
                col = "transparent",
                lwd = 2,
                border.col = "#000000",
                labels = "Black-Majority District")

tmap_save(e_map, filename = paste0(out_filepath, dtype, "_enacted_bvap.png"), 
          units = "in", dpi=300, width = 5)
tmap_save(p_map, filename = paste0(out_filepath, dtype, "_remedy_map_bvap.png"), 
          units = "in", dpi=300, width = 5)


#### Filter and create map of enacted mvap map ####
mvap_enacted <- remedy_map |>
  filter(mvap_r >= .5)

e_mmap <- tm_shape(remedy_map) +
  tm_polygons("mvap_r", breaks=c(0, .25, .37, .5, .75, 1), # change the variable to what you're mapping
              palette = mvap_colors, border.col = "gray", title = "Minority Voting-Age Pop") +
  tm_shape(mvap_enacted) +
  tm_borders(lwd=2, col = "#000000", alpha = 1) +
  tm_layout(legend.format= list(fun=function(x) paste0(formatC(x*100, digits=0, format="f"), " %")),
            frame = FALSE) + 
  tm_add_legend('fill',
                col = "transparent",
                lwd = 2,
                border.col = "#000000",
                labels = "Minority-Majority District")

#### Filter and create map of proposed mvap map ####
mvap_proposed <- remedy_map |>
  filter(mvap_r >= .5)

p_mmap <- tm_shape(remedy_map) +
  tm_polygons("mvap_r", breaks=c(0, .25, .37, .5, .75, 1), # change the variable to what you're mapping
              palette = mvap_colors, border.col = "gray", title = "Minority Voting-Age Pop") +
  tm_shape(mvap_proposed) +
  tm_borders(lwd=2, col = "#000000", alpha = 1) +
  tm_layout(legend.format= list(fun=function(x) paste0(formatC(x*100, digits=0, format="f"), " %")),
            frame = FALSE) + 
  tm_add_legend('fill',
                col = "transparent",
                lwd = 2,
                border.col = "#000000",
                labels = "Minority-Majority District")

tmap_save(e_mmap, filename = paste0(out_filepath, dtype, "_enacted_mvap.png"), 
          units = "in", dpi=300, width = 5)
tmap_save(p_mmap, filename = paste0(out_filepath, dtype, "_remedy_map_mvap.png"), 
          units = "in", dpi=300, width = 5)

#### Filter and create map of proposed and enacted INFLUENCE maps for all 4 groups ####

mvap_proposed_influence <- remedy_map |>
  filter(mvap_r >= .37 & mvap_r < .5)
bvap_proposed_influence <- remedy_map |>
  filter(bvap_r >= .37 & bvap_r < .5)
avap_proposed_influence <- remedy_map |>
  filter(avap_r >= .37 & avap_r < .5)
hvap_proposed_influence <- remedy_map |>
  filter(hvap_r >= .37 & hvap_r < .5)

p_inf_mmap <- tm_shape(remedy_map) +
  tm_polygons("mvap_r", breaks=c(0, .25, .37, .5, .75, 1), # change the variable to what you're mapping
              palette = mvap_colors, border.col = "gray", title = "Minority Voting-Age Pop") +
  tm_shape(mvap_proposed_influence) +
  tm_borders(lwd=2, col = "#000000", alpha = 1) +
  tm_layout(legend.format= list(fun=function(x) paste0(formatC(x*100, digits=0, format="f"), " %")),
            frame = FALSE)  + 
  tm_add_legend('fill',
                col = "transparent",
                lwd = 2,
                border.col = "#000000",
                labels = "Minority-Influence District")


p_inf_bmap <- tm_shape(remedy_map) +
  tm_polygons("bvap_r", breaks=c(0, .25, .37, .5, .75, 1), # change the variable to what you're mapping
              palette = bvap_colors, border.col = "#aeaeae", title = "Black Voting-Age Pop") +
  tm_shape(bvap_proposed_influence) +
  tm_borders(lwd=2, col = "#000000", alpha = 1) +
  tm_layout(legend.format= list(fun=function(x) paste0(formatC(x*100, digits=0, format="f"), " %")),
            frame = FALSE)   + 
  tm_add_legend('fill',
                col = "transparent",
                lwd = 2,
                border.col = "#000000",
                labels = "Black-Influence District")

p_inf_amap <- tm_shape(remedy_map) +
  tm_polygons("avap_r", breaks=c(0, .25, .37, .5, .75, 1), # change the variable to what you're mapping
              palette = avap_colors, border.col = "#aeaeae", title = "Asian Voting-Age Pop") +
  # tm_shape(avap_proposed_influence) +
  # tm_borders(lwd=3, col = "#000000", alpha = 1) +
  tm_layout(legend.format= list(fun=function(x) paste0(formatC(x*100, digits=0, format="f"), " %")),
            frame = FALSE)   + 
  tm_add_legend('fill',
                col = "transparent",
                lwd = 2,
                border.col = "#000000",
                labels = "Asian-Influence District")

p_inf_hmap <- tm_shape(remedy_map) +
  tm_polygons("hvap_r", breaks=c(0, .25, .37, .5, .75, 1), # change the variable to what you're mapping
              palette = hvap_colors, border.col = "#aeaeae", title = "Hispanic Voting-Age Pop") +
  tm_layout(legend.format= list(fun=function(x) paste0(formatC(x*100, digits=0, format="f"), " %")),
            frame = FALSE)   + 
  tm_add_legend('fill',
                col = "transparent",
                lwd = 2,
                border.col = "#000000",
                labels = "Hispanic-Influence District")


tmap_save(p_inf_mmap, filename = paste0(out_filepath, dtype, "_remedy_map_influnece_mvap.png"), 
          units = "in", dpi=300, width = 5)
tmap_save(p_inf_bmap, filename = paste0(out_filepath, dtype, "_remedy_map_influnece_bvap.png"), 
          units = "in", dpi=300, width = 5)
tmap_save(p_inf_amap, filename = paste0(out_filepath, dtype, "_remedy_map_influnece_avap.png"), 
          units = "in", dpi=300, width = 5)
tmap_save(p_inf_hmap, filename = paste0(out_filepath, dtype, "_remedy_map_influnece_hvap.png"), 
          units = "in", dpi=300, width = 5)

#### Create map of proposed PARTISAN LEAN map ####

p_part_map <- tm_shape(remedy_map) +
  tm_polygons("partisan_lean", breaks=c(0, .4, .465, .5, .535, .6, 1), # change the variable to what you're mapping
              palette = partisan_colors, border.col = "gray", title = "Percent Dem (2018-21)") +
  tm_layout(legend.format= list(fun=function(x) paste0(formatC(x*100, digits=0, format="f"), " %")),
            frame = FALSE)

p_part_map

e_part_map <- tm_shape(enacted) +
  tm_polygons("partisan", breaks=c(0, .4, .465, .5, .535, .6, 1), # change the variable to what you're mapping
              palette = partisan_colors, border.col = "gray", title = "Percent Dem (2018-21)") +
  tm_layout(legend.format= list(fun=function(x) paste0(formatC(x*100, digits=0, format="f"), " %")),
            frame = FALSE)

e_part_map

tmap_save(p_part_map, filename = paste0(out_filepath, dtype, "_remedy_map_partisan.png"), 
          units = "in", dpi=300, width = 5)
tmap_save(e_part_map, filename = paste0(out_filepath, dtype, "_enacted_partisan.png"), 
          units = "in", dpi=300, width = 5)
