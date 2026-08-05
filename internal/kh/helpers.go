package kh

import qdrant "github.com/qdrant/go-client/qdrant"

func boolPtr(v bool) *bool { return &v }

func valueString(v string) *qdrant.Value {
	return &qdrant.Value{Kind: &qdrant.Value_StringValue{StringValue: v}}
}

func valueInt(v int64) *qdrant.Value {
	return &qdrant.Value{Kind: &qdrant.Value_IntegerValue{IntegerValue: v}}
}

func valueStrings(values []string) *qdrant.Value {
	list := make([]*qdrant.Value, 0, len(values))
	for _, v := range values {
		list = append(list, valueString(v))
	}
	return &qdrant.Value{Kind: &qdrant.Value_ListValue{ListValue: &qdrant.ListValue{Values: list}}}
}
