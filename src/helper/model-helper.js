const saveOrUpdate = (Model) => {
  return (data, condition, options = {}) => {
    return Model.findOne({ where: condition }).then((obj) => {
      if (obj) return obj.update(data)
      return Model.create(data, options)
    })
  }
}

const createIfNotExists = (Model) => {
  return (data, condition) => {
    return Model.findOne({ where: condition }).then((obj) => {
      if (!obj) return Model.create(data)
    })
  }
}

const patch = (Model) => {
  return (data, condition) => {
    Object.keys(data).forEach((key) => {
      if (data[key] === null) {
        delete data[key]
      }
    })
    return Model.update(data, condition)
  }
}

export const inject = (Model) => {
  const functions = { saveOrUpdate, createIfNotExists, patch }
  Object.keys(functions).forEach((nameFunction) => {
    Model[nameFunction] = functions[nameFunction](Model)
  })
  return Model
}

export default { inject }
