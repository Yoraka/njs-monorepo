export class RollingCache<T> {
    private data: T[] = []
    private maxSize: number
    
    constructor(maxSize: number) {
      this.maxSize = maxSize
    }
  
    add(item: T) {
      this.data.push(item)
      if (this.data.length > this.maxSize) {
        this.data.shift()
      }
    }
  
    getAll(): T[] {
      return [...this.data]
    }
  
    getLast(n: number): T[] {
      return this.data.slice(-n)
    }
  
    clear() {
      this.data = []
    }
  }