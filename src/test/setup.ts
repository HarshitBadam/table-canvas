import '@testing-library/jest-dom'
import { enableMapSet } from 'immer'

// Enable Immer's MapSet plugin for handling Sets in the store
enableMapSet()

if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function() {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsText(this)
    })
  }
}
