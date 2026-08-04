export function shouldHandleCarouselDrag(emblaApiOrEvent, event) {
  const dragEvent = event ?? emblaApiOrEvent;
  return !dragEvent?.target?.closest?.('[data-carousel-scroll-region]');
}
