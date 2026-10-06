export class ReviewStore {
    queue = new Map();
    /**
     * Enqueues an analyzed checkout event for review
     */
    enqueue(event, input) {
        const item = {
            event,
            input,
            status: 'pending',
        };
        this.queue.set(event.event_id, item);
        return item;
    }
    /**
     * Retrieves an item by event ID
     */
    get(eventId) {
        return this.queue.get(eventId);
    }
    /**
     * Lists items with optional filtering by status or priority
     */
    list(filter) {
        const all = Array.from(this.queue.values());
        return all.filter((item) => {
            if (filter?.status && item.status !== filter.status)
                return false;
            return true;
        });
    }
    /**
     * Records human reviewer outcome
     */
    submitReview(eventId, submission) {
        const item = this.queue.get(eventId);
        if (!item)
            return null;
        const fullReview = {
            event_id: eventId,
            reviewer_id: submission.reviewer_id,
            decision: submission.decision,
            label: submission.label,
            notes: submission.notes,
            timestamp: new Date().toISOString(),
        };
        item.review = fullReview;
        item.status = 'reviewed';
        this.queue.set(eventId, item);
        return item;
    }
    clear() {
        this.queue.clear();
    }
}
//# sourceMappingURL=review_store.js.map